// Çelësi sekret i lojtarit në këtë shfletues: vërteton te serveri që veprimet janë të tijat.
const SECRET_KEY = 'gamezone_player_secret';

export function playerSecret(): string {
  try {
    let s = window.localStorage.getItem(SECRET_KEY);
    if (!s) {
      const a = new Uint8Array(20);
      window.crypto.getRandomValues(a);
      s = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
      window.localStorage.setItem(SECRET_KEY, s);
    }
    return s;
  } catch {
    return '';
  }
}
