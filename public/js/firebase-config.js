/* Firebase web config.
 *
 * On Firebase Hosting (wiki-speedruns.web.app) you can leave this as null: the app reads
 * the config automatically from /__/firebase/init.json.
 *
 * Anywhere else (local dev, the single-file HTML download, another host), paste the config
 * from Firebase console → Project settings → Your apps → Web app. These values are public
 * identifiers, not secrets; access is enforced by firestore.rules.
 */
window.WS_FIREBASE_CONFIG = null;
// window.WS_FIREBASE_CONFIG = {
//   apiKey: '...',
//   authDomain: 'wiki-speedruns.firebaseapp.com',
//   projectId: 'wiki-speedruns',
//   storageBucket: 'wiki-speedruns.appspot.com',
//   messagingSenderId: '...',
//   appId: '...',
// };
