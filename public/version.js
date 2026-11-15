// @zone socle | Choix de la version (V1.6) : classe « tel » (smartphone) ou « tab » (tablette) posée sur <html> avant le premier affichage, d'après le plus petit côté de l'écran (moins de 600 px : smartphone) ou le réglage « Affichage » (localStorage « affichage » : auto | tel | tab ; sans localStorage : auto). Lu une fois au chargement : la rotation ne change jamais de version. Expose window.APP_VERSION {tel, choix, apk} (V1.9 : apk = page affichée par l'application Android, User-Agent « Domowa-APK/ »). Chargé dans <head> avant les feuilles de style ; aucune requête, aucune adresse de serveur.
(function () {
  var choix = "auto", cote, tel;
  try { choix = window.localStorage.getItem("affichage") || "auto"; } catch (e) {}
  if (choix !== "tel" && choix !== "tab") choix = "auto";
  cote = Math.min(window.screen.width || 0, window.screen.height || 0) || Math.min(window.innerWidth || 0, window.innerHeight || 0);
  tel = choix === "tel" || (choix === "auto" && cote > 0 && cote < 600);
  document.documentElement.classList.add(tel ? "tel" : "tab");
  window.APP_VERSION = { tel: tel, choix: choix, apk: /Domowa-APK\//.test(navigator.userAgent || "") };
})();
// FIN
