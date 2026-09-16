/**
 * Stored goal text keeps @app:<id>; UI and email swap in the current app name.
 */

function appById(apps, id) {
  const key = String(id);
  return (apps || []).find((app) => app && String(app.id) === key) || null;
}

/**
 * @param {unknown} text
 * @param {{ id?: unknown, name?: string }[] | null | undefined} apps
 * @returns {string}
 */
export function displayGoalText(text, apps) {
  if (!text) return "";
  return String(text).replace(/@app:([A-Za-z0-9_-]+)/g, (full, id) => {
    const app = appById(apps, id);
    return app && app.name ? `@${app.name}` : full;
  });
}
