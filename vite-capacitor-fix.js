/**
 * إصلاح "s is not a function" في Android WebView
 * يستبدل relList.supports() بثابت "preload"
 */
export default function viteCapacitorFix() {
  const regex = /[a-z]+&&[a-z]+\.supports&&[a-z]+\.supports\("modulepreload"\)\?"modulepreload":"preload"/;
  const replacement = '"preload"';
  return {
    name: 'vite-capacitor-fix',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === 'chunk' && f.code && f.code.includes('modulepreload')) {
          f.code = f.code.replace(regex, replacement);
        }
      }
    },
  };
}
