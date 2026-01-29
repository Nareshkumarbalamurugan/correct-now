export type EffectivePlan = {
  planLabel: "Free" | "Pro";
  planKey: "free" | "pro";
  isPro: boolean;
  subscriptionStatus: string;
};

const toLower = (value: unknown) => String(value ?? "").trim().toLowerCase();

export const getEffectivePlan = (userData: any): EffectivePlan => {
  const planField = toLower(userData?.plan);
  const entitlementPlan = Number(userData?.wordLimit) >= 5000 || planField === "pro";

  const status = toLower(userData?.subscriptionStatus);
  const hasStatus = Boolean(status);
  const updatedAtRaw = userData?.subscriptionUpdatedAt;
  const updatedAt = updatedAtRaw ? new Date(String(updatedAtRaw)) : null;
  const isRecent = updatedAt
    ? Date.now() - updatedAt.getTime() <= 1000 * 60 * 60 * 24 * 31
    : false;
  const isActive = status === "active" && (updatedAt ? isRecent : true);

  const isPro = hasStatus ? isActive && entitlementPlan : entitlementPlan;
  return {
    planLabel: isPro ? "Pro" : "Free",
    planKey: isPro ? "pro" : "free",
    isPro,
    subscriptionStatus: status || "inactive",
  };
};
