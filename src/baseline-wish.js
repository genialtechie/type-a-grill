// BASELINE — extracted Nov 23, 2026 from Oyudo's "Grill Creator Lab" artifact
// (Grill_Creator_Lab__Copy.html, lines 2066-2135) at Haleem's direction.
//
// This is `wish()`, the artifact's self-described "stand-in for the AI": a
// client-side word matcher over the shop's options. No model, no API call.
// It handles simple prompts and approximates the rest, saying so via `diff`
// notes ("closest match"). Known limits, by construction:
//   - one metal/finish patch applied to the whole scope: no split metals
//     per arch, no per-tooth exceptions beyond front-two scope + two-tone
//   - coloured stones snap to the closest available stone
//   - pictures are not read at all
// The Ember parser in this repo exists to beat this baseline on the eval
// set in evals/. Kept verbatim as the before-picture; it references the
// artifact's app globals (T, SET, DEF, counts(), onList(), ...) and does
// not run standalone.
  // the stand-in for the AI: a word matcher over the shop's own options. Anything it can't make becomes the closest match, and it says so.
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, sixteen: 16 };
  var JOIN = [[/open ?face/g, 'openface'], [/diamond ?cut/g, 'diamondcut'], [/diamond ?dust/g, 'diamonddust'], [/deep ?cut/g, 'deepcut'], [/(?:two|2) ?tone/g, 'twotone'], [/bust ?down/g, 'bustdown'], [/white ?gold/g, 'whitegold'], [/(?:rose|pink) ?gold/g, 'rosegold'], [/black ?gold/g, 'blackgold'], [/lab ?(?:grown|diamonds?|made)/g, 'labdiamond'], [/(?:natural|real) ?diamonds?/g, 'naturaldiamond'], [/(?:one|1) ?of ?(?:one|1)|one of a kind/g, 'oneofone'], [/full ?set|whole mouth|all (?:my |of my )?teeth|every tooth/g, 'fullset']];
  function wish(text, pic) {
    var s = ' ' + text.toLowerCase().replace(/×/g, ' x ').replace(/[^a-z0-9& ]/g, ' ').replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|sixteen)\b/g, function (w) { return NUMW[w]; }) + ' ';
    JOIN.forEach(function (j) { s = s.replace(j[0], j[1]); }); s = s.replace(/\s+/g, ' ');
    var diff = [], fresh = !onList().length, has = function (re) { return re.test(s); }, m, top = null, bot = null, c0 = counts();
    // which teeth
    if (has(/fullset/)) { top = 16; bot = 16; }
    else if ((m = s.match(/(\d+) ?(?:x|by|and|&|over) ?(\d+)/))) { top = +m[1]; bot = +m[2]; }
    else {
      var mt = s.match(/(\d+) (?:on (?:the )?)?(?:top|upper)/) || s.match(/(?:top|upper) (?:row |teeth )?(?:of )?(\d+)/), mb = s.match(/(\d+) (?:on (?:the )?)?(?:bottom|lower)/) || s.match(/(?:bottom|lower) (?:row |teeth )?(?:of )?(\d+)/);
      if (mt) top = +mt[1]; if (mb) bot = +mb[1];
      if (top === null && bot === null) {
        var n = s.match(/ (\d+) /), k = n ? +n[1] : 6, tw = has(/ (?:top|upper) /), bw = has(/ (?:bottom|lower) /);
        if (has(/ single | 1 tooth /)) { top = 1; bot = 0; }
        else if (has(/ 2 piece /)) { top = 2; bot = 0; }
        else if (bw && !tw) { bot = k; top = fresh ? 0 : c0[0]; }
        else if (tw && !bw) { top = k; bot = fresh ? 0 : c0[1]; }
        else if (n || tw || bw) { top = k; bot = k; }
        else if (fresh && (text || !pic)) { top = 6; bot = 6; diff.push('You didn\'t say which teeth, so it\'s 6 × 6, the most popular set.'); }
      } else { if (top === null) top = fresh ? 0 : c0[0]; if (bot === null) bot = fresh ? 0 : c0[1]; }
    }
    if (top !== null && (top > 16 || bot > 16)) { top = Math.min(16, top); bot = Math.min(16, bot); diff.push('16 teeth per row is the most.'); }
    var fangs = has(/\b(?:fangs?|vampire|canines?)\b/);
    if (fangs && (top === null ? c0[0] : top) < 6) { top = 6; diff.push('Fangs sit on the upper canines, so it\'s 6 on top.'); }
    if (pic && !text) { if (fresh) { top = 6; bot = 6; DEF.type = 'iced'; diff.push('This prototype can\'t read pictures, so here\'s an iced 6 × 6 to start from.'); } else diff.push('This prototype can\'t read pictures, so nothing changed.'); }
    if (pic) diff.push('Your picture goes to the jeweler with your design; the real AI will read it too.');
    if (top !== null) { if (!top && !bot) { top = 6; bot = 6; } setRange(top, bot); ui.visited.teeth = 1; }
    // metal
    var patch = {};
    if (has(/whitegold|\bwhite\b/)) patch.metal = 'white'; else if (has(/rosegold|\brose\b/)) patch.metal = 'rose'; else if (has(/silver|sterling/)) patch.metal = 'silver'; else if (has(/platinum|\bplat\b/)) patch.metal = 'platinum';
    else if (has(/blackgold/)) { patch.metal = 'white'; diff.push('No black gold here; white gold is the closest.'); }
    else if (has(/titanium|steel|tungsten/)) { patch.metal = 'silver'; diff.push('No titanium or steel here; silver is the closest.'); }
    else if (has(/yellow|\bgold\b/)) patch.metal = 'yellow';
    if ((m = s.match(/\b(10|14|18) ?k\b/))) patch.karat = m[1] + 'k'; else if ((m = s.match(/\b(2[0-4]) ?k\b/))) { patch.karat = '18k'; diff.push(m[1] + 'K isn\'t offered; 18K is the highest here.'); } else if (has(/\b9 ?k\b/)) { patch.karat = '10k'; diff.push('10K is the lowest here, close to 9K.'); }
    // finish and stones
    var style = null, iced = has(/\b(?:ice|iced|icy|bustdown|flooded|flood|vvs|bling|pave|diamonds?|stones?|moissanite|moiss|honeycomb|mosaic|prong|labdiamond|naturaldiamond)\b/);
    if (has(/openface|\bopen\b/)) style = 'open';
    if (has(/diamondcut|faceted/)) style = 'cut';
    if (has(/diamonddust|\bdust\b/)) style = 'dust';
    if (has(/engrav|scroll/)) style = 'engr';
    if (has(/opal/)) { style = 'opal'; patch.opal = has(/\bfire\b|\bred\b|orange/) ? 'fire' : has(/\bblue\b/) ? 'blue' : 'white'; }
    if (has(/\bsolid\b|\bplain\b/)) style = 'solid';
    if (iced) {
      patch.type = 'iced';
      if (style && style !== 'open' && style !== 'solid') { diff.push('With stones set, the finish is the frame around them, so ' + STYLES[style][0].toLowerCase() + ' doesn\'t apply.'); style = 'solid'; }
      if (has(/honeycomb/)) patch.setting = 'honeycomb'; else if (has(/mosaic/)) patch.setting = 'mosaic'; else if (has(/prong/)) patch.setting = 'prong';
      if (has(/labdiamond|\blab\b/)) patch.stone = 'lab'; else if (has(/naturaldiamond|\bnatural\b|\breal\b/)) patch.stone = 'natural'; else if (has(/moiss/)) patch.stone = 'moissanite';
      if (style !== 'opal' && has(/\b(?:rub(?:y|ies)|red|emeralds?|green|sapphires?|blue|pink|purple|rainbow|colou?red|black diamonds?)\b/)) diff.push('No coloured stones here, so ' + STONES[patch.stone || cur().stone][0].toLowerCase() + 's, the closest match.');
    } else if (style && style !== 'open' && style !== 'solid') patch.type = 'plain';
    if (style) patch.style = style;
    // extras
    if (fangs) SET.fangs = true;
    if (has(/\bperm\b|permanent|seamless/)) SET.cut = 'permanent'; else if (has(/deepcut|removable/)) SET.cut = 'deep';
    if ((m = s.match(/\b(?:initials?|letters?|spell(?:ing)?|says?|saying|name|word) (?:of |that say |with |in |on it )?(?!on|in|of|the|with|and|my|it|iced|gold|a|an)([a-z0-9&]{1,6})\b/))) { SET.ins.text = m[1].toUpperCase(); SET.ins.style = has(/iced letters|letters iced|letters in stones/) ? 'iced' : has(/diamondcut letters|letters diamondcut|raised letters/) ? 'cut' : 'engraved'; }
    if (has(/charms?|oneofone|crest|crown|cross|custom piece/)) diff.push('Charms are picked by hand in Extras, and the jeweler quotes them.');
    if (has(/cuban|chain|pendant|\bring\b|bracelet|watch/)) diff.push('This builds grillz only.');
    if (has(/enamel|paint/)) diff.push('No enamel here yet.');
    // where it goes: the whole set, or the front teeth when they say so
    var scope = onList();
    if (!fresh && top === null && has(/\bfront\b/)) { var two = has(/front (?:2|two)|(?:2|two) front/); scope = two ? [7, 8, 23, 24].filter(function (k) { return T[k].on; }) : groupTeeth('front'); if (!scope.length) scope = onList(); }
    var whole = scope.length === onList().length;
    scope.forEach(function (k) { var t = T[k]; for (var key in patch) t[key] = patch[key]; if (t.type === 'iced' && t.style !== 'open' && t.style !== 'solid') t.style = 'solid'; });
    if (whole) for (var key in patch) DEF[key] = patch[key];
    if (has(/twotone/)) { var mid = [7, 8, 23, 24].filter(function (k) { return T[k].on; }).slice(0, 2); mid.forEach(function (k) { T[k].metal = T[k].metal === 'white' ? 'yellow' : 'white'; }); }
    if (SET.ins.text && (SET.ins.tooth === null || !T[SET.ins.tooth] || !T[SET.ins.tooth].on)) SET.ins.tooth = firstFront();
    var built = receipt(); if (insOn()) built += ' · "' + SET.ins.text + '"'; if (SET.cut === 'permanent') built += ' · permanent look';
    return { built: built, diff: diff };
  }
