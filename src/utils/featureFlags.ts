const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

export const isFeatureFlagEnabled = (value: unknown): boolean => {
  return TRUE_VALUES.has(String(value ?? "").trim().toLowerCase());
};

export const isExperimentalNavigationEnabled = (): boolean => {
  return isFeatureFlagEnabled(import.meta.env.VITE_SHOW_EXPERIMENTAL_NAV);
};
