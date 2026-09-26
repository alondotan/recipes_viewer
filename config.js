// Recipes from Google Drive. Leave apiKey or folder empty to use recipes/index.json instead.
// The key is visible to anyone who opens the site, so restrict it in Google Cloud Console
// to this site's address (HTTP referrers) and to the Google Drive API only.
window.CONFIG = {
  drive: {
    apiKey: '',
    folder: '', // folder ID, or the folder's full share link
  },
};
