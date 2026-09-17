/**
 * art.js — the whole scene as one inline SVG, zero image assets.
 * World space is ~1000 units wide; the camera in game.js animates the viewBox.
 */
(function (global) {
  'use strict';

  var TABLE_Y = 760;
  var HEAD_Y = 430;
  var SEATS = { p1: 300, p2: 700 };

  function room() {
    var stars = '';
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 22; i++) {
      stars += '<circle class="twinkle" style="animation-delay:' + (rnd() * 3).toFixed(2) + 's" cx="' +
        (390 + rnd() * 220).toFixed(0) + '" cy="' + (150 + rnd() * 200).toFixed(0) + '" r="' + (1.5 + rnd() * 2.5).toFixed(1) + '" fill="#fff"/>';
    }
    var bulbs = '';
    var bulbColors = ['#ffd166', '#ff6b9a', '#6be4ff', '#9dff7a'];
    for (var b = 0; b < 15; b++) {
      var x = -40 + b * 77;
      var y = 60 + Math.sin((b / 14) * Math.PI) * 60 + (b % 2) * 8;
      bulbs += '<circle class="bulb" style="animation-delay:' + (b * 0.17).toFixed(2) + 's" cx="' + x + '" cy="' + y + '" r="11" fill="' + bulbColors[b % 4] + '"/>';
    }

    return '' +
      '<defs>' +
        '<linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#241a4a"/><stop offset="1" stop-color="#3b2a6b"/></linearGradient>' +
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#0b1440"/><stop offset="1" stop-color="#2a3b8f"/></linearGradient>' +
        '<linearGradient id="wood" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0" stop-color="#c97a45"/><stop offset=".08" stop-color="#a85f33"/><stop offset="1" stop-color="#6e3a1d"/></linearGradient>' +
        '<radialGradient id="lampGlow"><stop offset="0" stop-color="#ffd98a" stop-opacity=".55"/><stop offset="1" stop-color="#ffd98a" stop-opacity="0"/></radialGradient>' +
        '<radialGradient id="spot"><stop offset="0" stop-color="#ff3b5c" stop-opacity=".55"/><stop offset="1" stop-color="#ff3b5c" stop-opacity="0"/></radialGradient>' +
      '</defs>' +
      // wall + floor, oversized so any camera aspect is covered
      '<rect x="-1500" y="-1500" width="4000" height="' + (1500 + TABLE_Y) + '" fill="url(#wall)"/>' +
      '<rect x="-1500" y="640" width="4000" height="3000" fill="#1a1233"/>' +
      '<g opacity=".08" stroke="#fff" stroke-width="3">' +
        '<line x1="-1500" y1="640" x2="2500" y2="640"/></g>' +
      // window
      '<rect x="370" y="130" width="260" height="240" rx="14" fill="#1b1238"/>' +
      '<rect x="384" y="144" width="232" height="212" rx="6" fill="url(#sky)"/>' + stars +
      '<circle cx="560" cy="200" r="30" fill="#fff5d6"/><circle cx="548" cy="192" r="30" fill="#2a3b8f" opacity=".0"/>' +
      '<rect x="496" y="144" width="8" height="212" fill="#1b1238"/><rect x="384" y="246" width="232" height="8" fill="#1b1238"/>' +
      // picture frame left, plant right
      '<rect x="60" y="170" width="150" height="120" rx="8" fill="#ffb14a"/><rect x="72" y="182" width="126" height="96" rx="4" fill="#5b3fa8"/>' +
      '<path d="M80 270 L125 215 L150 245 L170 225 L190 270Z" fill="#9f7bff"/><circle cx="170" cy="205" r="10" fill="#ffd166"/>' +
      '<g transform="translate(860 520)"><path d="M-40 120 L40 120 L30 40 L-30 40Z" fill="#e0603a"/>' +
        '<path d="M0 45 C-60 0 -70 -80 -20 -120 C-10 -60 -5 -20 0 45Z" fill="#3ec77a"/>' +
        '<path d="M0 45 C60 0 80 -70 30 -130 C15 -60 8 -20 0 45Z" fill="#2fa865"/>' +
        '<path d="M0 45 C-10 -40 0 -110 0 -160 C20 -100 15 -30 0 45Z" fill="#4fdc8b"/></g>' +
      // lamp
      '<circle cx="120" cy="470" r="220" fill="url(#lampGlow)"/>' +
      '<path d="M80 420 L160 420 L140 360 L100 360Z" fill="#ffcf6e"/><rect x="116" y="420" width="8" height="220" fill="#2b2050"/>' +
      // string lights
      '<path d="M-60 55 Q500 175 1060 55" fill="none" stroke="#120c28" stroke-width="4"/>' + bulbs;
  }

  function table() {
    return '' +
      '<ellipse cx="500" cy="' + (TABLE_Y + 12) + '" rx="620" ry="40" fill="#000" opacity=".25"/>' +
      '<rect x="-600" y="' + TABLE_Y + '" width="2200" height="2000" fill="url(#wood)"/>' +
      '<rect x="-600" y="' + TABLE_Y + '" width="2200" height="10" fill="#e3985f"/>' +
      // face-down cards + a phone with the round timer vibe
      cards(430, TABLE_Y + 70, -8) + cards(570, TABLE_Y + 75, 10) +
      '<g transform="translate(500 ' + (TABLE_Y + 150) + ')"><rect x="-70" y="-24" width="140" height="48" rx="24" fill="#120c28" opacity=".55"/>' +
      '<text x="0" y="12" text-anchor="middle" class="svg-font" font-size="30" font-weight="900" fill="#ff3b5c" letter-spacing="3">VOTE</text></g>';
  }

  function cards(x, y, rot) {
    return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')">' +
      '<rect x="-38" y="-52" width="76" height="104" rx="10" fill="#fff"/>' +
      '<rect x="-31" y="-45" width="62" height="90" rx="6" fill="#ff3b5c"/>' +
      '<text x="0" y="16" text-anchor="middle" class="svg-font" font-size="46" font-weight="900" fill="#fff">?</text></g>';
  }

  /* A seated player, head centred on (0,0). */
  function person(id, look) {
    var skin = look.skin, shade = look.shade;
    var hair = look.hairPath;
    return '' +
      '<g id="' + id + '" class="person" transform="translate(' + SEATS[id] + ' ' + HEAD_Y + ')">' +
        '<ellipse class="spotlight" cx="0" cy="120" rx="260" ry="300" fill="url(#spot)"/>' +
        '<g class="bob">' +
          // torso
          '<path d="M-165 360 C-170 200 -120 125 0 125 C120 125 170 200 165 360Z" fill="' + look.shirt + '"/>' +
          '<path d="M-40 128 Q0 175 40 128" fill="none" stroke="' + look.shirtDark + '" stroke-width="12" stroke-linecap="round"/>' +
          (look.strings ? '<path d="M-22 150 L-26 230 M22 150 L26 230" stroke="#fff" stroke-width="7" stroke-linecap="round"/>' : '') +
          '<rect x="-30" y="70" width="60" height="70" rx="20" fill="' + shade + '"/>' +
          // arms on the table
          '<path d="M-150 220 C-190 280 -150 330 -60 325" fill="none" stroke="' + look.shirtDark + '" stroke-width="58" stroke-linecap="round"/>' +
          '<path d="M150 220 C190 280 150 330 60 325" fill="none" stroke="' + look.shirtDark + '" stroke-width="58" stroke-linecap="round"/>' +
          // head
          '<g class="head">' +
            '<circle cx="-88" cy="12" r="20" fill="' + shade + '"/><circle cx="88" cy="12" r="20" fill="' + skin + '"/>' +
            '<ellipse cx="0" cy="0" rx="90" ry="98" fill="' + skin + '"/>' +
            '<circle cx="-50" cy="38" r="15" fill="#ff7a8a" opacity=".35"/><circle cx="50" cy="38" r="15" fill="#ff7a8a" opacity=".35"/>' +
            '<g class="eyes">' +
              '<ellipse cx="-33" cy="-2" rx="18" ry="21" fill="#fff"/><ellipse cx="33" cy="-2" rx="18" ry="21" fill="#fff"/>' +
              '<g class="pupils"><circle cx="-31" cy="1" r="10" fill="#1b1030"/><circle cx="35" cy="1" r="10" fill="#1b1030"/>' +
              '<circle cx="-27" cy="-3" r="3.5" fill="#fff"/><circle cx="39" cy="-3" r="3.5" fill="#fff"/></g>' +
            '</g>' +
            '<g class="brows" stroke="' + look.hair + '" stroke-width="8" stroke-linecap="round">' +
              '<path d="M-50 -38 Q-33 -48 -16 -40"/><path d="M16 -40 Q33 -48 50 -38"/></g>' +
            (look.glasses ? '<g fill="none" stroke="#1b1030" stroke-width="6"><circle cx="-33" cy="-2" r="28"/><circle cx="33" cy="-2" r="28"/><path d="M-5 -4 Q0 -10 5 -4"/></g>' : '') +
            '<path class="mouth-closed" d="M-24 46 Q0 64 24 46" fill="none" stroke="#1b1030" stroke-width="7" stroke-linecap="round"/>' +
            '<g class="mouth-open"><ellipse cx="0" cy="52" rx="19" ry="15" fill="#1b1030"/><ellipse cx="0" cy="60" rx="11" ry="6" fill="#ff6b81"/></g>' +
            '<path class="mouth-evil" d="M-32 40 Q0 78 32 40 Q0 58 -32 40Z" fill="#1b1030"/>' +
            '<path d="' + hair + '" fill="' + look.hair + '"/>' +
            '<g class="horns" fill="#ff2d4f"><path d="M-62 -70 C-90 -110 -84 -150 -64 -170 C-62 -130 -40 -105 -30 -88Z"/>' +
              '<path d="M62 -70 C90 -110 84 -150 64 -170 C62 -130 40 -105 30 -88Z"/></g>' +
          '</g>' +
          // badge that stamps on at the end
          '<g class="badge" transform="translate(0 -170)"><g class="badge-in">' +
            '<rect x="-120" y="-34" width="240" height="68" rx="34" class="badge-bg"/>' +
            '<text x="0" y="13" text-anchor="middle" class="svg-font badge-text" font-size="36" font-weight="900" letter-spacing="2"></text></g></g>' +
        '</g>' +
      '</g>';
  }

  /* Hands and name plate sit on top of the table, so they are a separate layer. */
  function front(id, look) {
    var x = SEATS[id];
    return '<g class="front" id="' + id + '-front" transform="translate(' + x + ' ' + HEAD_Y + ')">' +
      '<g class="bob"><circle cx="-55" cy="330" r="30" fill="' + look.skin + '"/><circle cx="55" cy="330" r="30" fill="' + look.skin + '"/></g>' +
      '<g transform="translate(0 ' + (TABLE_Y - HEAD_Y + 95) + ')">' +
        '<rect x="-90" y="-30" width="180" height="60" rx="12" fill="#fff"/>' +
        '<rect x="-90" y="20" width="180" height="10" rx="4" fill="' + look.shirt + '"/>' +
        '<text x="0" y="12" text-anchor="middle" class="svg-font name" font-size="36" font-weight="900" fill="#1b1030"></text></g>' +
      '</g>';
  }

  var LOOKS = {
    p1: {
      skin: '#ffcfa3', shade: '#eab58a', shirt: '#ff8a2a', shirtDark: '#e46d10', hair: '#6b3a1f', strings: true,
      hairPath: 'M-94 -8 C-104 -96 -46 -128 6 -122 C70 -126 108 -84 96 -6 C86 -44 64 -58 30 -64 C44 -48 40 -40 34 -36 C10 -60 -30 -66 -60 -50 C-78 -40 -88 -26 -94 -8Z',
    },
    p2: {
      skin: '#c98b62', shade: '#b27650', shirt: '#22c7b8', shirtDark: '#169e92', hair: '#1f1a2e', glasses: true,
      hairPath: 'M-96 -20 C-100 -100 -40 -124 0 -124 C44 -124 100 -104 96 -20 L96 -34 C60 -58 -60 -58 -96 -34Z M-110 -30 C-60 -46 60 -46 120 -26 C130 -18 110 -12 90 -16 C40 -30 -60 -30 -106 -18Z',
    },
  };

  global.ImposterArt = {
    TABLE_Y: TABLE_Y,
    HEAD_Y: HEAD_Y,
    SEATS: SEATS,
    scene: function () {
      return room() + person('p1', LOOKS.p1) + person('p2', LOOKS.p2) + table() + front('p1', LOOKS.p1) + front('p2', LOOKS.p2) + '<g id="bubbles"></g>';
    },
  };
})(window);
