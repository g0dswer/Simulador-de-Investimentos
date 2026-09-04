import Std

/-!
  Exact, small model of the simulator's monthly nominal step.

  The TypeScript implementation uses IEEE-754 `number`s and computes the
  monthly rate from annual rates with `Math.pow`.  This file deliberately
  models the arithmetic specification over `Rat`: it proves the ordering of
  the contribution and interest operations, while leaving floating-point and
  real-power equivalence to a later differential-validation layer.
-/

namespace Investment

/- The two operation orders used by `src/lib/calculos.ts`. -/
def stepBeginning (balance contribution growthFactor : Rat) : Rat :=
  (balance + contribution) * growthFactor

def stepEnd (balance contribution growthFactor : Rat) : Rat :=
  balance * growthFactor + contribution

/- A monthly nominal rate is represented by its growth factor `1 + rate`. -/
def nominalStepBeginning (balance contribution monthlyRate : Rat) : Rat :=
  stepBeginning balance contribution (1 + monthlyRate)

def nominalStepEnd (balance contribution monthlyRate : Rat) : Rat :=
  stepEnd balance contribution (1 + monthlyRate)

theorem stepBeginning_expanded
    (balance contribution growthFactor : Rat) :
    stepBeginning balance contribution growthFactor =
      balance * growthFactor + contribution * growthFactor := by
  unfold stepBeginning
  rw [Rat.add_mul]

theorem stepEnd_expanded
    (balance contribution growthFactor : Rat) :
    stepEnd balance contribution growthFactor =
      balance * growthFactor + contribution := by
  rfl

theorem stepBeginning_no_interest
    (balance contribution : Rat) :
    stepBeginning balance contribution 1 = balance + contribution := by
  simp [stepBeginning]

theorem stepEnd_no_interest
    (balance contribution : Rat) :
    stepEnd balance contribution 1 = balance + contribution := by
  simp [stepEnd]

theorem nominalStepBeginning_no_interest
    (balance contribution : Rat) :
    nominalStepBeginning balance contribution 0 = balance + contribution := by
  unfold nominalStepBeginning stepBeginning
  rw [Rat.add_zero, Rat.mul_one]

theorem nominalStepEnd_no_interest
    (balance contribution : Rat) :
    nominalStepEnd balance contribution 0 = balance + contribution := by
  unfold nominalStepEnd stepEnd
  rw [Rat.add_zero, Rat.mul_one]

/-
  With a non-negative contribution and a growth factor at least one, paying at
  the beginning cannot leave a smaller balance than paying at the end.
-/
theorem stepEnd_le_stepBeginning
    {balance contribution growthFactor : Rat}
    (hcontribution : 0 ≤ contribution)
    (hgrowth : 1 ≤ growthFactor) :
    stepEnd balance contribution growthFactor ≤
      stepBeginning balance contribution growthFactor := by
  have hcontribution_growth : contribution ≤ contribution * growthFactor := by
    have hmul : contribution * 1 ≤ contribution * growthFactor :=
      Rat.mul_le_mul_of_nonneg_left hgrowth hcontribution
    simpa [Rat.mul_one] using hmul
  unfold stepEnd stepBeginning
  rw [Rat.add_mul]
  exact (Rat.add_le_add_left).mpr hcontribution_growth

theorem nominalStepEnd_le_nominalStepBeginning
    {balance contribution monthlyRate : Rat}
    (hcontribution : 0 ≤ contribution)
    (hrate : 0 ≤ monthlyRate) :
    nominalStepEnd balance contribution monthlyRate ≤
      nominalStepBeginning balance contribution monthlyRate := by
  apply stepEnd_le_stepBeginning hcontribution
  have h : (1 : Rat) + 0 ≤ 1 + monthlyRate :=
    (Rat.add_le_add_left).mpr hrate
  simpa [Rat.add_zero] using h

/- Both orders are monotone in the contribution when the growth factor is
   non-negative. -/
theorem stepBeginning_mono_contribution
    {balance contribution₁ contribution₂ growthFactor : Rat}
    (hcontribution : contribution₁ ≤ contribution₂)
    (hgrowth : 0 ≤ growthFactor) :
    stepBeginning balance contribution₁ growthFactor ≤
      stepBeginning balance contribution₂ growthFactor := by
  unfold stepBeginning
  apply Rat.mul_le_mul_of_nonneg_right
  · exact (Rat.add_le_add_left).mpr hcontribution
  · exact hgrowth

theorem stepEnd_mono_contribution
    {balance contribution₁ contribution₂ growthFactor : Rat}
    (hcontribution : contribution₁ ≤ contribution₂) :
    stepEnd balance contribution₁ growthFactor ≤
      stepEnd balance contribution₂ growthFactor := by
  unfold stepEnd
  exact (Rat.add_le_add_left).mpr hcontribution

/- The simulator's real-rate adjustment, isolated from the annual-to-monthly
   `Math.pow` conversion. -/
def realRate (nominalRate inflationRate : Rat) : Rat :=
  (1 + nominalRate) / (1 + inflationRate) - 1

theorem realRate_zero_when_nominal_equals_inflation
    {rate : Rat}
    (hdenominator : 1 + rate ≠ 0) :
    realRate rate rate = 0 := by
  unfold realRate
  rw [Rat.div_def, Rat.mul_inv_cancel _ hdenominator, Rat.sub_self]

/- Repeated monthly steps with a constant contribution. -/
def balanceAfterBeginning : Nat → Rat → Rat → Rat → Rat
  | 0, initial, _, _ => initial
  | n + 1, initial, contribution, growthFactor =>
      stepBeginning
        (balanceAfterBeginning n initial contribution growthFactor)
        contribution growthFactor

def balanceAfterEnd : Nat → Rat → Rat → Rat → Rat
  | 0, initial, _, _ => initial
  | n + 1, initial, contribution, growthFactor =>
      stepEnd
        (balanceAfterEnd n initial contribution growthFactor)
        contribution growthFactor

def monthMultiple : Nat → Rat → Rat
  | 0, _ => 0
  | months + 1, contribution => monthMultiple months contribution + contribution

theorem monthMultiple_succ (months : Nat) (contribution : Rat) :
    monthMultiple (Nat.succ months) contribution =
      monthMultiple months contribution + contribution := by
  rfl

def noInterestClosed (months : Nat) (initial contribution : Rat) : Rat :=
  initial + monthMultiple months contribution

theorem balanceAfterBeginning_no_interest_closed
    (months : Nat) (initial contribution : Rat) :
    balanceAfterBeginning months initial contribution 1 =
      noInterestClosed months initial contribution := by
  induction months with
  | zero =>
      calc
        balanceAfterBeginning 0 initial contribution 1 = initial := rfl
        _ = noInterestClosed 0 initial contribution := by
          unfold noInterestClosed monthMultiple
          rw [Rat.add_zero]
  | succ months ih =>
      calc
        balanceAfterBeginning (Nat.succ months) initial contribution 1 =
            stepBeginning
              (balanceAfterBeginning months initial contribution 1)
              contribution 1 := rfl
        _ = balanceAfterBeginning months initial contribution 1 + contribution :=
          stepBeginning_no_interest _ _
        _ = noInterestClosed months initial contribution + contribution := by
          rw [ih]
        _ = noInterestClosed (Nat.succ months) initial contribution := by
          unfold noInterestClosed
          rw [monthMultiple_succ, Rat.add_assoc]

theorem balanceAfterEnd_no_interest_closed
    (months : Nat) (initial contribution : Rat) :
    balanceAfterEnd months initial contribution 1 =
      noInterestClosed months initial contribution := by
  induction months with
  | zero =>
      calc
        balanceAfterEnd 0 initial contribution 1 = initial := rfl
        _ = noInterestClosed 0 initial contribution := by
          unfold noInterestClosed monthMultiple
          rw [Rat.add_zero]
  | succ months ih =>
      calc
        balanceAfterEnd (Nat.succ months) initial contribution 1 =
            stepEnd
              (balanceAfterEnd months initial contribution 1)
              contribution 1 := rfl
        _ = balanceAfterEnd months initial contribution 1 + contribution :=
          stepEnd_no_interest _ _
        _ = noInterestClosed months initial contribution + contribution := by
          rw [ih]
        _ = noInterestClosed (Nat.succ months) initial contribution := by
          unfold noInterestClosed
          rw [monthMultiple_succ, Rat.add_assoc]

/- The following helper replaces generic ordered-ring automation with the
   exact Rat lemmas exposed by Lean's dependency-free core. -/
theorem ratAddLeAdd
    {a b c d : Rat}
    (hab : a ≤ b)
    (hcd : c ≤ d) :
    a + c ≤ b + d := by
  apply Rat.le_trans ((Rat.add_le_add_right).mpr hab)
  exact (Rat.add_le_add_left).mpr hcd

theorem monthMultiple_mono
    (months : Nat) {contribution₁ contribution₂ : Rat}
    (hcontribution : contribution₁ ≤ contribution₂) :
    monthMultiple months contribution₁ ≤ monthMultiple months contribution₂ := by
  induction months with
  | zero =>
      unfold monthMultiple
      exact Rat.le_refl
  | succ months ih =>
      change
        monthMultiple months contribution₁ + contribution₁ ≤
          monthMultiple months contribution₂ + contribution₂
      exact ratAddLeAdd ih hcontribution

theorem noInterestClosed_mono
    (months : Nat)
    {initial₁ initial₂ contribution₁ contribution₂ : Rat}
    (hinitial : initial₁ ≤ initial₂)
    (hcontribution : contribution₁ ≤ contribution₂) :
    noInterestClosed months initial₁ contribution₁ ≤
      noInterestClosed months initial₂ contribution₂ := by
  unfold noInterestClosed
  exact ratAddLeAdd hinitial (monthMultiple_mono months hcontribution)

end Investment
