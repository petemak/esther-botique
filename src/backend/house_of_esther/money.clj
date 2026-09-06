(ns house-of-esther.money
  "Money is always an object {:amount <integer KES> :currency \"KES\"}.
   Kenyan shillings have no working subunit here, so every amount is a whole integer.")

(def currency "KES")

(defn kes
  "Build a Money object. Rounds to the nearest whole shilling."
  [amount]
  {:amount (long (Math/round (double (or amount 0)))) :currency currency})

(defn amount [m] (long (or (:amount m) 0)))

(defn add [& ms] (kes (reduce + 0 (map amount ms))))

(defn sub [a b] (kes (- (amount a) (amount b))))

(defn negate [m] (kes (- (amount m))))

(defn scale [m factor] (kes (* (amount m) (double factor))))

(defn zeroish? [m] (zero? (amount m)))

(defn eq? [a b] (= (amount a) (amount b)))

(defn percent-of
  "value percent of base, as a positive Money (caller negates for a discount line)."
  [base pct]
  (kes (/ (* (amount base) (double pct)) 100.0)))
