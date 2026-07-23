/*
 * theory.js — tab "Theorie" ("Leer de hemel lezen"): korte, praktische uitleg
 * bij wat Heldere Hemel meet, plus veldtips. Bewust geen encyclopedie —
 * de sterrenkijker in je jaszak. Statisch; één keer opgebouwd.
 * Exposeert HH.renderTheory().
 */
(function () {
  "use strict";
  const HH = window.HH;
  let built = false;

  function armSVG() {
    const ox = 34, oy = 126, Rr = 96;
    const pt = (deg) => [ox + Rr * Math.cos(deg * Math.PI / 180), oy - Rr * Math.sin(deg * Math.PI / 180)];
    let s = '<svg viewBox="0 0 280 150" class="arm-svg" xmlns="http://www.w3.org/2000/svg">';
    s += '<line x1="' + ox + '" y1="' + oy + '" x2="' + (ox + Rr + 20) + '" y2="' + oy + '" stroke="var(--line)" stroke-width="1"/>';
    s += '<line x1="' + ox + '" y1="' + oy + '" x2="' + ox + '" y2="' + (oy - Rr - 16) + '" stroke="var(--line)" stroke-width="1"/>';
    let d = "";
    for (let a = 0; a <= 90; a += 3) { const [x, y] = pt(a); d += (a === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1) + " "; }
    s += '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="2"/>';
    for (let a = 10; a < 90; a += 10) {
      const [x, y] = pt(a), [x2, y2] = [ox + (Rr + 6) * Math.cos(a * Math.PI / 180), oy - (Rr + 6) * Math.sin(a * Math.PI / 180)];
      s += '<line x1="' + x.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="var(--muted)" stroke-width="1"/>';
    }
    s += '<text x="' + (ox + Rr + 24) + '" y="' + (oy + 4) + '" font-size="10" fill="var(--muted)" text-anchor="middle">horizon 0\u00b0</text>';
    s += '<text x="' + (ox + 2) + '" y="' + (oy - Rr - 20) + '" font-size="10" fill="var(--muted)">zenit 90\u00b0</text>';
    const [mx, my] = pt(46); s += '<text x="' + (mx + 8).toFixed(1) + '" y="' + my.toFixed(1) + '" font-size="11" fill="var(--ink)" font-weight="600">\u2248 9 vuisten</text>';
    s += '<circle cx="' + ox + '" cy="' + oy + '" r="3" fill="var(--ink)"/>';
    s += '</svg>';
    return s;
  }

  function renderTheory() {
    const root = HH.$("#theory"); if (!root || built) return;
    root.innerHTML =
      '<p class="th-lead"><b>Leer de hemel lezen</b> \u2014 de sterrenkijker in je jaszak. Alles hieronder gaat over wat Heldere Hemel meet, plus een paar handigheidjes voor onderweg.</p>' +

      '<div class="th-card"><div class="th-h">\uD83C\uDF0C Hoe kijkt de app naar de hemel?</div>' +
      '<p>Heldere Hemel beoordeelt geen \u2018mooi weer\u2019, maar stelt een paar hemel-vragen en <b>vermenigvuldigt</b> ze: is de lucht <b>helder</b> (weinig wolken), is het <b>donker</b> genoeg (weinig stadslicht), stoort de <b>maan</b>, en is de lucht <b>rustig</b>? Omdat het factoren zijn, trekt \u00e9\u00e9n zwakke schakel de hele avond omlaag \u2014 een perfecte lucht midden in de stad blijft matig, en een donkere plek onder de wolken ook.</p>' +
      '<p>Voor dat \u2018donker genoeg\u2019 schat de app een <b>Bortle</b>-getal, van 1 (inktzwart) tot 9 (grootstad). Vuistregel: de <b>Melkweg</b> zie je pas echt vanaf ongeveer Bortle 4.</p></div>' +

      '<div class="th-card"><div class="th-h">\u270B Met je hand meet je graden</div>' +
      '<p>De wielen bij <b>Planeten &amp; sterren</b> geven hoogte in graden: 0\u00b0 is de horizon, 90\u00b0 recht boven je. Je hand op armlengte is een verrassend goede gradenboog:</p>' +
      '<div class="hand-grid">' +
        '<div class="hand-item"><b>1\u00b0</b><span>pink\u00advinger</span></div>' +
        '<div class="hand-item"><b>5\u00b0</b><span>drie vingers</span></div>' +
        '<div class="hand-item"><b>10\u00b0</b><span>vuist</span></div>' +
        '<div class="hand-item"><b>20\u00b0</b><span>gespreide hand</span></div>' +
      '</div>' +
      '<p class="th-aside">Houd je arm <b>helemaal gestrekt</b>. Iedereen heeft iets andere handen, dus zie het als een schatting, niet als een meetlat.</p>' +
      '<div class="arm-wrap">' + armSVG() + '</div>' +
      '<p>Zo krijg je ook gevoel voor <b>afstanden</b> tussen sterren: 1 vuist \u2248 10\u00b0, drie vuisten naast elkaar \u2248 30\u00b0, en van de horizon tot recht boven je \u2248 9 vuisten. De Grote Beer past bijvoorbeeld in een paar vuisten. En een leuk weetje: de volle maan en de zon zijn elk maar een <b>\u00bd\u00b0</b> groot \u2014 kleiner dan je pink; ze lijken alleen groot.</p></div>' +

      '<div class="th-card"><div class="th-h">\uD83C\uDF19 De maan: vriend en vijand</div>' +
      '<p>Maanlicht is de grootste \u2018natuurlijke lichtvervuiling\u2019. Rond <b>volle maan</b> verdwijnen zwakke sterren en nevels; rond <b>nieuwe maan</b> is de hemel op z\u2019n donkerst. De app dempt de score naar maanfase \u00e9n -hoogte \u2014 een maan onder de horizon stoort niet. Dus <b>vijand</b> voor de Melkweg en sterrenstelsels (kies dan de dagen rond nieuwe maan), maar <b>vriend</b> als je juist de maan zelf of heldere planeten wilt bekijken.</p></div>' +

      '<div class="th-card"><div class="th-h">\u2600\uFE0F Schemering: wanneer wordt het echt donker?</div>' +
      '<p>Na zonsondergang wordt het in stappen donker: <b>burgerlijk</b> (\u22126\u00b0), <b>nautisch</b> (\u221212\u00b0) en <b>astronomisch</b> (\u221218\u00b0). Pas onder \u221218\u00b0 is de hemel echt zwart. Daarom scoort de app alleen de donkere uren en toont schemering lichter in de balk. In de zomer zakt de zon op onze breedte \u2019s nachts niet ver genoeg: dan blijft het nautisch schemer en wordt het nooit helemaal donker.</p></div>' +

      '<div class="th-card"><div class="th-h">\uD83D\uDC40 Je ogen als instrument</div>' +
      '<p>Geef je ogen <b>20\u201330 minuten</b> om aan het donker te wennen \u2014 daarna zie je veel meer. \u00c9\u00e9n blik op een witte telefoon zet dat in \u00e9\u00e9n klap terug; gebruik <b>rood licht</b> of nachtmodus. En kijk zwakke dingen niet recht aan maar er net naast (\u2018<b>schuin kijken</b>\u2019): de rand van je oog is gevoeliger voor zwak licht.</p></div>' +

      '<div class="th-card"><div class="th-h">\uD83C\uDF2B\uFE0F Helder is niet altijd scherp</div>' +
      '<p>Soms is de lucht kraakhelder, maar lijken de sterren te <b>trillen</b>. Dat komt door bewegende luchtlagen hoog boven ons: planeten en maandetails worden er wazig van. Dat is iets anders dan <b>doorzicht</b> \u2014 hoe helder en nevelvrij de lucht is, wat juist telt voor zwakke nevels. Een heldere nacht kan dus toch onrustig zijn.</p>' +
      '<p class="th-aside">Astronomen noemen die rust \u2018seeing\u2019; de app leidt het af uit de wind hoog in de atmosfeer (de straalstroom).</p></div>' +

      '<div class="th-card"><div class="th-h">\u2B50 Waarom bewegen de sterren?</div>' +
      '<p>De <b>aarde draait</b>, en daardoor lijkt de hele hemel langzaam van oost naar west te schuiven \u2014 net als de zon overdag. Een ster komt elke nacht ongeveer <b>4 minuten</b> eerder op dan de vorige. Over de weken tikt dat aan: daarom zie je in de winter heel andere sterrenbeelden dan in de zomer. Sleep de tijd-slider in de wielen en je ziet precies datzelfde gebeuren.</p></div>' +

      '<div class="th-card"><div class="th-h">\u2648 De dierenriem: de weg van de zon</div>' +
      '<p>De dierenriem is een denkbeeldige <b>gordel langs de baan van de zon</b> (de ecliptica). Zon, maan en planeten lopen daar allemaal langs. De oude Babyloni\u00ebrs verdeelden die gordel in <b>12</b> stukken, omdat 12 handig rekende \u2014 \u00e9\u00e9n per maanmaand.</p>' +
      '<p>Aan de echte hemel loopt de zon ook nog door <b>Slangendrager</b>, en de sterrenbeelden zijn in de loop der eeuwen langzaam opgeschoven doordat de aardas heel traag tolt. Daarom vallen de sterrenbeelden aan de hemel net niet samen met de astrologische tekens \u2014 een mooie \u2018aha\u2019 als je met de wielen speelt.</p></div>' +

      '<div class="th-card"><div class="th-h">\uD83E\uDDED Veldtips voor beginners</div>' +
      '<ul class="th-tips">' +
        '<li>De grootste knoppen: <b>helder weer + rond nieuwe maan + weg van de stad</b>. Precies wat \u2018Betere hemel in de buurt\u2019 voor je afweegt.</li>' +
        '<li>Laat je ogen wennen en vermijd wit licht (rood/nachtmodus).</li>' +
        '<li>Meet hoogtes met je <b>vuist (10\u00b0)</b> \u2014 de wielen wijzen de richting.</li>' +
        '<li>Planeten staan vaak laag vlak <b>na zonsondergang</b> of <b>v\u00f3\u00f3r zonsopkomst</b>.</li>' +
        '<li>Kleed je warm en let op <b>dauw</b> op je lenzen \u2014 de app waarschuwt ervoor.</li>' +
        '<li>Zoek eerst een helder patroon en \u2018hop\u2019 van daaruit naar zwakkere dingen.</li>' +
      '</ul></div>' +

      '<p class="th-foot">Net genoeg om de scores en de wielen te lezen \u2014 geen cursus astronomie. Elk begrip hierboven komt terug in de app.</p>';
    built = true;
  }

  HH.renderTheory = renderTheory;
})();
