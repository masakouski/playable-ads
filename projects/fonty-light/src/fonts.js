/**
 * fonts.js - "fonts" here are Unicode look-alike alphabets, exactly what the
 * real app produces: the result is plain text, so it survives copy/paste into
 * any other app. Each style maps A-Z / a-z / 0-9 onto another code block.
 */
(function (global) {
  'use strict';

  var cp = String.fromCodePoint;

  /** Build a converter from block start code points (0 = leave as is). */
  function block(upper, lower, digit, holes) {
    return function (ch) {
      var c = ch.charCodeAt(0);
      if (holes && holes[ch]) return holes[ch];
      if (c >= 65 && c <= 90) return upper ? cp(upper + c - 65) : ch;
      if (c >= 97 && c <= 122) return lower ? cp(lower + c - 97) : ch;
      if (c >= 48 && c <= 57) return digit ? cp(digit + c - 48) : ch;
      return ch;
    };
  }

  function table(lowerChars) {
    var arr = Array.from(lowerChars);
    return function (ch) {
      var c = ch.toLowerCase().charCodeAt(0);
      return c >= 97 && c <= 122 ? arr[c - 97] : ch;
    };
  }

  var FONTS = {
    script:    { name: 'Script',     map: block(0x1D4D0, 0x1D4EA, 0) },
    fraktur:   { name: 'Gothic',     map: block(0x1D56C, 0x1D586, 0) },
    // Double-struck has holes in the block: those letters live in Letterlike Symbols.
    outline:   { name: 'Outline',    map: block(0x1D538, 0x1D552, 0x1D7D8,
                 { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' }) },
    bold:      { name: 'Bold',       map: block(0x1D5D4, 0x1D5EE, 0x1D7EC) },
    bubble:    { name: 'Bubble',     map: block(0x24B6, 0x24D0, 0, {
                 '0': '⓪', '1': '①', '2': '②', '3': '③', '4': '④',
                 '5': '⑤', '6': '⑥', '7': '⑦', '8': '⑧', '9': '⑨' }) },
    smallcaps: { name: 'Small Caps', map: table('ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ') },
    mono:      { name: 'Typewriter', map: block(0x1D670, 0x1D68A, 0x1D7F6) },
    wide:      { name: 'Wide',       map: block(0xFF21, 0xFF41, 0xFF10) },
  };

  function convert(id, text) {
    var f = FONTS[id];
    if (!f) return text;
    var out = '';
    for (var i = 0; i < text.length; i++) out += f.map(text[i]);
    return out;
  }

  global.Fonts = { list: FONTS, convert: convert };
})(window);
