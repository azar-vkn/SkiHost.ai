/** Runs before first paint: saved choice, else the OS preference, else dark. */
export const themeScript = `(function(){try{var t=localStorage.getItem("skihost-theme");if(!t){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}})();`;
