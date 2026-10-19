# Your apps / Your websites

Startup setup shows installed Mac catalog matches and built-in native devices under **Your apps**, and remaining website destinations under **Your websites**. Area categories and app-name search cover every supported catalog entry. Website matches sort first; installed apps are not duplicated.

## One-click bookmarks on Mac

**Import bookmarks** reads local Chrome, Edge, Brave and Chromium Default/Profile bookmark JSON files and Safari's bookmark plist after the user clicks. It does not show a file picker or require an exported HTML file. Work runs off the main actor. Firefox and Windows bookmark discovery are not implemented.

The reader limits file size and tree depth, skips unreadable sources, and reports permission-limited sources when detected. Safari can require macOS access that Worldlet cannot bypass. It does not read history, cookies, passwords or page content. Only HTTPS origins and a short allowlist of shared-host service prefixes reach the UI; document/account IDs, titles and query parameters are discarded. Matching uses explicit hosts and service paths locally. Only matched Applet IDs and selections persist; manual unchecks survive later imports.

This discovers Applets; it does not connect their accounts or import a browser login. Worldlet's existing browsing memory still covers Worldlet visits only.

## Catalog and placement

The catalog has **112** entries, including PostHog, Cloudflare, Vercel, Netlify, Supabase, Firebase, Sentry, Docker, Railway, Render, GitLab and Jira. These developer entries open websites without claiming API access or background account sync. Docker Desktop detection leads to its web dashboard.

Selection is independent from placement visibility. Six regions each expose five named places. Pins take priority over most-used defaults; the region-name ellipsis opens every installed member in a searchable library. Cross-region moves and changing landmark themes preserve Applets and source data. The old stepping-stone overlay and previous/next scene paging are retired. See [region customization](../world/ENVIRONMENT.md#area-taxonomy).

Publisher icons have provenance in `ui/applets/brand-assets.json`; generated devices and stone assets retain their prompts beside the assets. Entering the world displays busy feedback before host setup begins. Google sign-in bypasses full agent imports on the connect path and opens the system browser through the desktop host.

Validation: website matching, startup UI import without a file chooser, temporary Chrome/Safari fixture decoding, complete catalog reachability, and the six-region library/placement fixture. Real personal bookmarks are not used in automated tests.
