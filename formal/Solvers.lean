import Investment

/-!
  Exact contracts used to justify the simulator's two numerical solvers.

  The financial recurrence is proved monotone over the domain enforced by the
  TypeScript implementation.  The bisection model is deliberately generic: a
  bracket records one point that misses the target and one that reaches it,
  and every refinement preserves that invariant.

  This module does not claim that JavaScript floating-point arithmetic is
  identical to `Rat`; executable differential tests remain the bridge between
  this exact specification and `src/lib/calculos.ts`.
-/

namespace Investment

/-! ## Financial-domain invariants -/

theorem stepBeginning_nonneg
    {balance contribution growthFactor : Rat}
    (hbalance : 0 ≤ balance)
    (hcontribution : 0 ≤ contribution)
    (hgrowth : 0 ≤ growthFactor) :
    0 ≤ stepBeginning balance contribution growthFactor := by
  unfold stepBeginning
  have hsum : 0 ≤ balance + contribution := by
    simpa [Rat.add_zero] using ratAddLeAdd hbalance hcontribution
  exact Rat.mul_nonneg hsum hgrowth

theorem stepEnd_nonneg
    {balance contribution growthFactor : Rat}
    (hbalance : 0 ≤ balance)
    (hcontribution : 0 ≤ contribution)
    (hgrowth : 0 ≤ growthFactor) :
    0 ≤ stepEnd balance contribution growthFactor := by
  unfold stepEnd
  simpa [Rat.add_zero] using
    ratAddLeAdd (Rat.mul_nonneg hbalance hgrowth) hcontribution

theorem stepBeginning_mono_balance
    {balance₁ balance₂ contribution growthFactor : Rat}
    (hbalance : balance₁ ≤ balance₂)
    (hgrowth : 0 ≤ growthFactor) :
    stepBeginning balance₁ contribution growthFactor ≤
      stepBeginning balance₂ contribution growthFactor := by
  unfold stepBeginning
  exact Rat.mul_le_mul_of_nonneg_right
    ((Rat.add_le_add_right).mpr hbalance) hgrowth

theorem stepEnd_mono_balance
    {balance₁ balance₂ contribution growthFactor : Rat}
    (hbalance : balance₁ ≤ balance₂)
    (hgrowth : 0 ≤ growthFactor) :
    stepEnd balance₁ contribution growthFactor ≤
      stepEnd balance₂ contribution growthFactor := by
  unfold stepEnd
  exact (Rat.add_le_add_right).mpr
    (Rat.mul_le_mul_of_nonneg_right hbalance hgrowth)

theorem stepBeginning_mono_both
    {balance₁ balance₂ contribution₁ contribution₂ growthFactor : Rat}
    (hbalance : balance₁ ≤ balance₂)
    (hcontribution : contribution₁ ≤ contribution₂)
    (hgrowth : 0 ≤ growthFactor) :
    stepBeginning balance₁ contribution₁ growthFactor ≤
      stepBeginning balance₂ contribution₂ growthFactor := by
  unfold stepBeginning
  exact Rat.mul_le_mul_of_nonneg_right
    (ratAddLeAdd hbalance hcontribution) hgrowth

theorem stepEnd_mono_both
    {balance₁ balance₂ contribution₁ contribution₂ growthFactor : Rat}
    (hbalance : balance₁ ≤ balance₂)
    (hcontribution : contribution₁ ≤ contribution₂)
    (hgrowth : 0 ≤ growthFactor) :
    stepEnd balance₁ contribution₁ growthFactor ≤
      stepEnd balance₂ contribution₂ growthFactor := by
  unfold stepEnd
  exact ratAddLeAdd
    (Rat.mul_le_mul_of_nonneg_right hbalance hgrowth)
    hcontribution

theorem balanceAfterBeginning_nonneg
    (months : Nat)
    {initial contribution growthFactor : Rat}
    (hinitial : 0 ≤ initial)
    (hcontribution : 0 ≤ contribution)
    (hgrowth : 0 ≤ growthFactor) :
    0 ≤ balanceAfterBeginning months initial contribution growthFactor := by
  induction months with
  | zero => exact hinitial
  | succ months ih =>
      exact stepBeginning_nonneg ih hcontribution hgrowth

theorem balanceAfterEnd_nonneg
    (months : Nat)
    {initial contribution growthFactor : Rat}
    (hinitial : 0 ≤ initial)
    (hcontribution : 0 ≤ contribution)
    (hgrowth : 0 ≤ growthFactor) :
    0 ≤ balanceAfterEnd months initial contribution growthFactor := by
  induction months with
  | zero => exact hinitial
  | succ months ih =>
      exact stepEnd_nonneg ih hcontribution hgrowth

theorem balanceAfterBeginning_mono
    (months : Nat)
    {initial₁ initial₂ contribution₁ contribution₂ growthFactor : Rat}
    (hinitial : initial₁ ≤ initial₂)
    (hcontribution : contribution₁ ≤ contribution₂)
    (hgrowth : 0 ≤ growthFactor) :
    balanceAfterBeginning months initial₁ contribution₁ growthFactor ≤
      balanceAfterBeginning months initial₂ contribution₂ growthFactor := by
  induction months with
  | zero => exact hinitial
  | succ months ih =>
      exact stepBeginning_mono_both ih hcontribution hgrowth

theorem balanceAfterEnd_mono
    (months : Nat)
    {initial₁ initial₂ contribution₁ contribution₂ growthFactor : Rat}
    (hinitial : initial₁ ≤ initial₂)
    (hcontribution : contribution₁ ≤ contribution₂)
    (hgrowth : 0 ≤ growthFactor) :
    balanceAfterEnd months initial₁ contribution₁ growthFactor ≤
      balanceAfterEnd months initial₂ contribution₂ growthFactor := by
  induction months with
  | zero => exact hinitial
  | succ months ih =>
      exact stepEnd_mono_both ih hcontribution hgrowth

theorem stepBeginning_mono_growth
    {balance contribution growth₁ growth₂ : Rat}
    (hbalance : 0 ≤ balance)
    (hcontribution : 0 ≤ contribution)
    (hgrowth : growth₁ ≤ growth₂) :
    stepBeginning balance contribution growth₁ ≤
      stepBeginning balance contribution growth₂ := by
  unfold stepBeginning
  have hsum : 0 ≤ balance + contribution := by
    simpa [Rat.add_zero] using ratAddLeAdd hbalance hcontribution
  exact Rat.mul_le_mul_of_nonneg_left hgrowth hsum

theorem stepEnd_mono_growth
    {balance contribution growth₁ growth₂ : Rat}
    (hbalance : 0 ≤ balance)
    (hgrowth : growth₁ ≤ growth₂) :
    stepEnd balance contribution growth₁ ≤
      stepEnd balance contribution growth₂ := by
  unfold stepEnd
  exact (Rat.add_le_add_right).mpr
    (Rat.mul_le_mul_of_nonneg_left hgrowth hbalance)

theorem balanceAfterBeginning_mono_growth
    (months : Nat)
    {initial contribution growth₁ growth₂ : Rat}
    (hinitial : 0 ≤ initial)
    (hcontribution : 0 ≤ contribution)
    (hgrowth₁ : 0 ≤ growth₁)
    (hgrowth₂ : 0 ≤ growth₂)
    (hgrowth : growth₁ ≤ growth₂) :
    balanceAfterBeginning months initial contribution growth₁ ≤
      balanceAfterBeginning months initial contribution growth₂ := by
  induction months with
  | zero => exact Rat.le_refl
  | succ months ih =>
      apply Rat.le_trans (stepBeginning_mono_balance ih hgrowth₁)
      exact stepBeginning_mono_growth
        (balanceAfterBeginning_nonneg months hinitial hcontribution hgrowth₂)
        hcontribution hgrowth

theorem balanceAfterEnd_mono_growth
    (months : Nat)
    {initial contribution growth₁ growth₂ : Rat}
    (hinitial : 0 ≤ initial)
    (hcontribution : 0 ≤ contribution)
    (hgrowth₁ : 0 ≤ growth₁)
    (hgrowth₂ : 0 ≤ growth₂)
    (hgrowth : growth₁ ≤ growth₂) :
    balanceAfterEnd months initial contribution growth₁ ≤
      balanceAfterEnd months initial contribution growth₂ := by
  induction months with
  | zero => exact Rat.le_refl
  | succ months ih =>
      apply Rat.le_trans (stepEnd_mono_balance ih hgrowth₁)
      exact stepEnd_mono_growth
        (balanceAfterEnd_nonneg months hinitial hcontribution hgrowth₂)
        hgrowth

/-! ## Exact closed forms for constant monthly inputs -/

def geometricSum : Nat → Rat → Rat
  | 0, _ => 0
  | months + 1, growthFactor =>
      geometricSum months growthFactor * growthFactor + 1

def closedBalanceEnd
    (months : Nat) (initial contribution growthFactor : Rat) : Rat :=
  initial * growthFactor ^ months +
    contribution * geometricSum months growthFactor

def closedBalanceBeginning
    (months : Nat) (initial contribution growthFactor : Rat) : Rat :=
  initial * growthFactor ^ months +
    contribution * geometricSum months growthFactor * growthFactor

theorem balanceAfterEnd_closed
    (months : Nat) (initial contribution growthFactor : Rat) :
    balanceAfterEnd months initial contribution growthFactor =
      closedBalanceEnd months initial contribution growthFactor := by
  induction months with
  | zero =>
      simp [balanceAfterEnd, closedBalanceEnd, geometricSum, Rat.add_zero]
  | succ months ih =>
      simp only [balanceAfterEnd, stepEnd, ih, closedBalanceEnd, geometricSum]
      rw [Rat.pow_succ]
      grind [Rat.add_mul, Rat.mul_add, Rat.mul_assoc, Rat.add_assoc,
        Rat.add_comm, Rat.add_left_comm]

theorem balanceAfterBeginning_closed
    (months : Nat) (initial contribution growthFactor : Rat) :
    balanceAfterBeginning months initial contribution growthFactor =
      closedBalanceBeginning months initial contribution growthFactor := by
  induction months with
  | zero =>
      simp [balanceAfterBeginning, closedBalanceBeginning, geometricSum,
        Rat.add_zero]
  | succ months ih =>
      simp only [balanceAfterBeginning, stepBeginning, ih,
        closedBalanceBeginning, geometricSum]
      rw [Rat.pow_succ]
      grind [Rat.add_mul, Rat.mul_add, Rat.mul_assoc, Rat.add_assoc,
        Rat.add_comm, Rat.add_left_comm]

theorem geometricSum_mul_sub
    (months : Nat) (growthFactor : Rat) :
    (growthFactor - 1) * geometricSum months growthFactor =
      growthFactor ^ months - 1 := by
  induction months with
  | zero =>
      simp [geometricSum, Rat.sub_eq_add_neg, Rat.add_neg_cancel]
  | succ months ih =>
      simp only [geometricSum]
      rw [Rat.pow_succ]
      grind [Rat.add_mul, Rat.mul_add, Rat.mul_assoc, Rat.add_assoc,
        Rat.add_comm, Rat.add_left_comm, Rat.sub_eq_add_neg]

theorem geometricSum_eq_quotient
    (months : Nat) {growthFactor : Rat}
    (hgrowth : growthFactor ≠ 1) :
    geometricSum months growthFactor =
      (growthFactor ^ months - 1) / (growthFactor - 1) := by
  have hsub : growthFactor - 1 ≠ 0 := by
    intro hz
    apply hgrowth
    have hadd := congrArg (fun value : Rat => value + 1) hz
    simpa [Rat.sub_eq_add_neg, Rat.add_assoc, Rat.neg_add_cancel,
      Rat.add_zero, Rat.zero_add] using hadd
  rw [Rat.div_def, ← geometricSum_mul_sub months growthFactor]
  symm
  rw [Rat.mul_comm (growthFactor - 1), Rat.mul_assoc,
    Rat.mul_inv_cancel _ hsub, Rat.mul_one]

/-! ## Target predicates and monotonicity used by the solvers -/

def MonotonePredicate (predicate : Rat → Prop) : Prop :=
  ∀ {a b : Rat}, a ≤ b → predicate a → predicate b

def reachesContributionBeginning
    (months : Nat) (initial growthFactor target contribution : Rat) : Prop :=
  target ≤ balanceAfterBeginning months initial contribution growthFactor

def reachesContributionEnd
    (months : Nat) (initial growthFactor target contribution : Rat) : Prop :=
  target ≤ balanceAfterEnd months initial contribution growthFactor

def reachesGrowthBeginning
    (months : Nat) (initial contribution target growthFactor : Rat) : Prop :=
  0 ≤ growthFactor ∧
    target ≤ balanceAfterBeginning months initial contribution growthFactor

def reachesGrowthEnd
    (months : Nat) (initial contribution target growthFactor : Rat) : Prop :=
  0 ≤ growthFactor ∧
    target ≤ balanceAfterEnd months initial contribution growthFactor

theorem reachesContributionBeginning_monotone
    (months : Nat)
    {initial growthFactor target contribution₁ contribution₂ : Rat}
    (hgrowth : 0 ≤ growthFactor)
    (hcontribution : contribution₁ ≤ contribution₂)
    (hreaches :
      reachesContributionBeginning months initial growthFactor target contribution₁) :
    reachesContributionBeginning months initial growthFactor target contribution₂ := by
  unfold reachesContributionBeginning at hreaches ⊢
  exact Rat.le_trans hreaches
    (balanceAfterBeginning_mono months Rat.le_refl hcontribution hgrowth)

theorem reachesContributionEnd_monotone
    (months : Nat)
    {initial growthFactor target contribution₁ contribution₂ : Rat}
    (hgrowth : 0 ≤ growthFactor)
    (hcontribution : contribution₁ ≤ contribution₂)
    (hreaches :
      reachesContributionEnd months initial growthFactor target contribution₁) :
    reachesContributionEnd months initial growthFactor target contribution₂ := by
  unfold reachesContributionEnd at hreaches ⊢
  exact Rat.le_trans hreaches
    (balanceAfterEnd_mono months Rat.le_refl hcontribution hgrowth)

theorem reachesGrowthBeginning_monotone
    (months : Nat)
    {initial contribution target growth₁ growth₂ : Rat}
    (hinitial : 0 ≤ initial)
    (hcontribution : 0 ≤ contribution)
    (hgrowth : growth₁ ≤ growth₂)
    (hreaches : reachesGrowthBeginning months initial contribution target growth₁) :
    reachesGrowthBeginning months initial contribution target growth₂ := by
  rcases hreaches with ⟨hgrowth₁, htarget⟩
  have hgrowth₂ : 0 ≤ growth₂ := Rat.le_trans hgrowth₁ hgrowth
  exact ⟨hgrowth₂, Rat.le_trans htarget
    (balanceAfterBeginning_mono_growth months hinitial hcontribution
      hgrowth₁ hgrowth₂ hgrowth)⟩

theorem reachesGrowthEnd_monotone
    (months : Nat)
    {initial contribution target growth₁ growth₂ : Rat}
    (hinitial : 0 ≤ initial)
    (hcontribution : 0 ≤ contribution)
    (hgrowth : growth₁ ≤ growth₂)
    (hreaches : reachesGrowthEnd months initial contribution target growth₁) :
    reachesGrowthEnd months initial contribution target growth₂ := by
  rcases hreaches with ⟨hgrowth₁, htarget⟩
  have hgrowth₂ : 0 ≤ growth₂ := Rat.le_trans hgrowth₁ hgrowth
  exact ⟨hgrowth₂, Rat.le_trans htarget
    (balanceAfterEnd_mono_growth months hinitial hcontribution
      hgrowth₁ hgrowth₂ hgrowth)⟩

theorem reachesContributionBeginning_isMonotone
    (months : Nat) (initial growthFactor target : Rat)
    (hgrowth : 0 ≤ growthFactor) :
    MonotonePredicate
      (reachesContributionBeginning months initial growthFactor target) := by
  intro contribution₁ contribution₂ hcontribution hreaches
  exact reachesContributionBeginning_monotone months hgrowth hcontribution hreaches

theorem reachesContributionEnd_isMonotone
    (months : Nat) (initial growthFactor target : Rat)
    (hgrowth : 0 ≤ growthFactor) :
    MonotonePredicate
      (reachesContributionEnd months initial growthFactor target) := by
  intro contribution₁ contribution₂ hcontribution hreaches
  exact reachesContributionEnd_monotone months hgrowth hcontribution hreaches

theorem reachesGrowthBeginning_isMonotone
    (months : Nat) (initial contribution target : Rat)
    (hinitial : 0 ≤ initial)
    (hcontribution : 0 ≤ contribution) :
    MonotonePredicate
      (reachesGrowthBeginning months initial contribution target) := by
  intro growth₁ growth₂ hgrowth hreaches
  exact reachesGrowthBeginning_monotone months hinitial hcontribution
    hgrowth hreaches

theorem reachesGrowthEnd_isMonotone
    (months : Nat) (initial contribution target : Rat)
    (hinitial : 0 ≤ initial)
    (hcontribution : 0 ≤ contribution) :
    MonotonePredicate
      (reachesGrowthEnd months initial contribution target) := by
  intro growth₁ growth₂ hgrowth hreaches
  exact reachesGrowthEnd_monotone months hinitial hcontribution hgrowth hreaches

/-! ## Generic bracket and bisection contract -/

def midpoint (lo hi : Rat) : Rat :=
  (lo + hi) / 2

private theorem double_div_two (value : Rat) :
    (value + value) / 2 = value := by
  rw [Rat.div_def, Rat.add_mul, ← Rat.mul_add]
  have hhalf : (2 : Rat)⁻¹ + (2 : Rat)⁻¹ = 1 := by native_decide
  rw [hhalf, Rat.mul_one]

theorem le_midpoint {lo hi : Rat} (horder : lo ≤ hi) :
    lo ≤ midpoint lo hi := by
  have hsum : lo + lo ≤ lo + hi := ratAddLeAdd Rat.le_refl horder
  have hhalf : (0 : Rat) ≤ (2 : Rat)⁻¹ :=
    Rat.le_of_lt (Rat.inv_pos.mpr (by decide))
  have hmul := Rat.mul_le_mul_of_nonneg_right hsum hhalf
  calc
    lo = (lo + lo) / 2 := (double_div_two lo).symm
    _ ≤ (lo + hi) / 2 := by simpa [Rat.div_def] using hmul
    _ = midpoint lo hi := rfl

theorem midpoint_le {lo hi : Rat} (horder : lo ≤ hi) :
    midpoint lo hi ≤ hi := by
  have hsum : lo + hi ≤ hi + hi := ratAddLeAdd horder Rat.le_refl
  have hhalf : (0 : Rat) ≤ (2 : Rat)⁻¹ :=
    Rat.le_of_lt (Rat.inv_pos.mpr (by decide))
  have hmul := Rat.mul_le_mul_of_nonneg_right hsum hhalf
  calc
    midpoint lo hi = (lo + hi) / 2 := rfl
    _ ≤ (hi + hi) / 2 := by simpa [Rat.div_def] using hmul
    _ = hi := double_div_two hi

structure SearchBracket where
  lo : Rat
  hi : Rat

def BracketInvariant
    (reaches : Rat → Prop) (bracket : SearchBracket) : Prop :=
  bracket.lo ≤ bracket.hi ∧
    ¬ reaches bracket.lo ∧
    reaches bracket.hi

def bisectStep
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    (bracket : SearchBracket) : SearchBracket :=
  let mid := midpoint bracket.lo bracket.hi
  if reaches mid then
    { lo := bracket.lo, hi := mid }
  else
    { lo := mid, hi := bracket.hi }

theorem bisectStep_preserves
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    {bracket : SearchBracket}
    (hinvariant : BracketInvariant reaches bracket) :
    BracketInvariant reaches (bisectStep reaches bracket) := by
  rcases hinvariant with ⟨horder, hlo, hhi⟩
  simp only [bisectStep]
  split
  next hmid => exact ⟨le_midpoint horder, hlo, hmid⟩
  next hmid => exact ⟨midpoint_le horder, hmid, hhi⟩

def bisectN
    (reaches : Rat → Prop)
    [DecidablePred reaches] : Nat → SearchBracket → SearchBracket
  | 0, bracket => bracket
  | iterations + 1, bracket =>
      bisectN reaches iterations (bisectStep reaches bracket)

theorem bisectN_preserves
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    (iterations : Nat)
    {bracket : SearchBracket}
    (hinvariant : BracketInvariant reaches bracket) :
    BracketInvariant reaches (bisectN reaches iterations bracket) := by
  induction iterations generalizing bracket with
  | zero => exact hinvariant
  | succ iterations ih =>
      exact ih (bisectStep_preserves reaches hinvariant)

theorem bisectN_upper_meets
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    (iterations : Nat)
    {bracket : SearchBracket}
    (hinvariant : BracketInvariant reaches bracket) :
    reaches (bisectN reaches iterations bracket).hi :=
  (bisectN_preserves reaches iterations hinvariant).2.2

theorem bisectN_lower_misses
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    (iterations : Nat)
    {bracket : SearchBracket}
    (hinvariant : BracketInvariant reaches bracket) :
    ¬ reaches (bisectN reaches iterations bracket).lo :=
  (bisectN_preserves reaches iterations hinvariant).2.1

theorem below_bracket_misses
    {reaches : Rat → Prop}
    (hmonotone : MonotonePredicate reaches)
    {bracket : SearchBracket}
    (hinvariant : BracketInvariant reaches bracket)
    {value : Rat}
    (hvalue : value ≤ bracket.lo) :
    ¬ reaches value := by
  intro hreaches
  exact hinvariant.2.1 (hmonotone hvalue hreaches)

theorem above_bracket_meets
    {reaches : Rat → Prop}
    (hmonotone : MonotonePredicate reaches)
    {bracket : SearchBracket}
    (hinvariant : BracketInvariant reaches bracket)
    {value : Rat}
    (hvalue : bracket.hi ≤ value) :
    reaches value :=
  hmonotone hvalue hinvariant.2.2

def bracketWidth (bracket : SearchBracket) : Rat :=
  bracket.hi - bracket.lo

theorem bisectStep_width
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    (bracket : SearchBracket) :
    bracketWidth (bisectStep reaches bracket) =
      bracketWidth bracket / 2 := by
  simp only [bisectStep]
  split <;>
    grind [bracketWidth, midpoint, Rat.div_def, Rat.add_mul,
      Rat.sub_eq_add_neg]

def halveN : Nat → Rat → Rat
  | 0, width => width
  | iterations + 1, width => halveN iterations (width / 2)

theorem bisectN_width
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    (iterations : Nat)
    (bracket : SearchBracket) :
    bracketWidth (bisectN reaches iterations bracket) =
      halveN iterations (bracketWidth bracket) := by
  induction iterations generalizing bracket with
  | zero => rfl
  | succ iterations ih =>
      change bracketWidth
        (bisectN reaches iterations (bisectStep reaches bracket)) = _
      rw [ih, bisectStep_width]
      rfl

theorem bisectN_solution_within_tolerance
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    (iterations : Nat)
    {bracket : SearchBracket}
    (hinvariant : BracketInvariant reaches bracket)
    (tolerance : Rat)
    (hwidth : halveN iterations (bracketWidth bracket) ≤ tolerance) :
    reaches (bisectN reaches iterations bracket).hi ∧
      bracketWidth (bisectN reaches iterations bracket) ≤ tolerance := by
  constructor
  · exact bisectN_upper_meets reaches iterations hinvariant
  · rw [bisectN_width]
    exact hwidth

/-! ## Explicit search-start outcomes -/

inductive SearchStart where
  | alreadyMeets
  | bracket (bounds : SearchBracket)
  | noBracket

def prepareSearch
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    (lo hi : Rat) : SearchStart :=
  if reaches lo then .alreadyMeets
  else if lo ≤ hi then
    if reaches hi then .bracket { lo, hi }
    else .noBracket
  else .noBracket

theorem prepareSearch_already_meets
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    {lo hi : Rat}
    (hmeets : reaches lo) :
    prepareSearch reaches lo hi = .alreadyMeets := by
  simp [prepareSearch, hmeets]

theorem prepareSearch_no_bracket
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    {lo hi : Rat}
    (hlower : ¬ reaches lo)
    (hupper : ¬ reaches hi) :
    prepareSearch reaches lo hi = .noBracket := by
  simp [prepareSearch, hlower, hupper]

theorem prepareSearch_bracket_sound
    (reaches : Rat → Prop)
    [DecidablePred reaches]
    {lo hi : Rat}
    {bracket : SearchBracket}
    (hprepared : prepareSearch reaches lo hi = .bracket bracket) :
    BracketInvariant reaches bracket := by
  unfold prepareSearch at hprepared
  split at hprepared <;> rename_i hlo
  · simp at hprepared
  · split at hprepared <;> rename_i horder
    · split at hprepared <;> rename_i hhi
      · simp only [SearchStart.bracket.injEq] at hprepared
        subst bracket
        exact ⟨horder, hlo, hhi⟩
      · simp at hprepared
    · simp at hprepared

end Investment
