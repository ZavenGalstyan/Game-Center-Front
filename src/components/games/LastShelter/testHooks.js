/** Dev/QA flags read from the URL: ?lstest=1 exposes window.__ls, &nosave=1 disables saving, &lstouch=1 forces touch controls. */
const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
export const TEST = q.get("lstest") === "1";
export const NO_SAVE = q.get("nosave") === "1";
export const TEST_TOUCH = q.get("lstouch") === "1";
