/**
 * engine.js — a very small flat-shaded WebGL renderer for the race playable.
 *
 * Adapted from the hole-eater engine (same reason for existing: ad networks
 * block external requests and a 600 KB library inside a 5 MB single file is a
 * bad trade for a scene made of boxes, cylinders and cones). What changed:
 *
 *   - the ground shader draws a straight multi-lane road — asphalt, lane
 *     dashes, edge lines, kerb blocks, grass, and a checkered finish band —
 *     entirely procedurally, so the ad ships with zero image assets;
 *   - the hole/pit machinery is gone; instead there is an unlit+alpha mode
 *     used for gate panels and blob shadows.
 *
 * Meshes are unit-sized and centred on the origin (a box spans -0.5..0.5 on
 * every axis, a cylinder has radius 0.5 and height 1), so an object's scale is
 * its size in world units.
 *
 * Render modes (uMode):
 *   0  lit solid
 *   1  ground / road (procedural, lit as a flat surface)
 *   2  unlit flat colour with uAlpha — gate panels, shadows, light cones
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ math */

  function mat4() { return new Float32Array(16); }

  function perspective(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }

  function lookAt(out, ex, ey, ez, cx, cy, cz) {
    var zx = ex - cx, zy = ey - cy, zz = ez - cz;
    var l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    // x = normalize(cross(up, z)) with up = (0,1,0)
    var xx = zz, xy = 0, xz = -zx;
    l = Math.hypot(xx, xy, xz);
    if (!l) { xx = 1; xy = 0; xz = 0; } else { xx /= l; xy /= l; xz /= l; }
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * ex + xy * ey + xz * ez);
    out[13] = -(yx * ex + yy * ey + yz * ez);
    out[14] = -(zx * ex + zy * ey + zz * ez);
    out[15] = 1;
    return out;
  }

  function multiply(out, a, b) {
    for (var c = 0; c < 4; c++) {
      var b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return out;
  }

  /** model matrix from position, XYZ euler rotation and scale (R = Rz*Ry*Rx). */
  function model(out, px, py, pz, rx, ry, rz, sx, sy, sz) {
    var cx = Math.cos(rx), sxa = Math.sin(rx);
    var cy = Math.cos(ry), sya = Math.sin(ry);
    var cz = Math.cos(rz), sza = Math.sin(rz);
    out[0] = cz * cy * sx;
    out[1] = sza * cy * sx;
    out[2] = -sya * sx;
    out[3] = 0;
    out[4] = (cz * sya * sxa - sza * cx) * sy;
    out[5] = (sza * sya * sxa + cz * cx) * sy;
    out[6] = cy * sxa * sy;
    out[7] = 0;
    out[8] = (cz * sya * cx + sza * sxa) * sz;
    out[9] = (sza * sya * cx - cz * sxa) * sz;
    out[10] = cy * cx * sz;
    out[11] = 0;
    out[12] = px; out[13] = py; out[14] = pz; out[15] = 1;
    return out;
  }

  /* --------------------------------------------------------------- meshes */

  function pushFace(P, N, I, quad, nx, ny, nz) {
    var base = P.length / 3;
    for (var i = 0; i < 4; i++) {
      P.push(quad[i][0], quad[i][1], quad[i][2]);
      N.push(nx, ny, nz);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  function boxMesh() {
    var P = [], N = [], I = [], h = 0.5;
    pushFace(P, N, I, [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]], 0, 0, 1);
    pushFace(P, N, I, [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h]], 0, 0, -1);
    pushFace(P, N, I, [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h]], 1, 0, 0);
    pushFace(P, N, I, [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h]], -1, 0, 0);
    pushFace(P, N, I, [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h]], 0, 1, 0);
    pushFace(P, N, I, [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h]], 0, -1, 0);
    return { P: P, N: N, I: I };
  }

  /** Cylinder / cone / pyramid: radius 0.5 at the bottom, rTop*0.5 at the top. */
  function tubeMesh(seg, rTop, caps) {
    var P = [], N = [], I = [], i, a0, a1;
    for (i = 0; i < seg; i++) {
      a0 = (i / seg) * Math.PI * 2;
      a1 = ((i + 1) / seg) * Math.PI * 2;
      var x0 = Math.cos(a0) * 0.5, z0 = Math.sin(a0) * 0.5;
      var x1 = Math.cos(a1) * 0.5, z1 = Math.sin(a1) * 0.5;
      var t0x = x0 * rTop, t0z = z0 * rTop, t1x = x1 * rTop, t1z = z1 * rTop;
      var mx = (Math.cos(a0) + Math.cos(a1)) * 0.5, mz = (Math.sin(a0) + Math.sin(a1)) * 0.5;
      var ml = Math.hypot(mx, mz) || 1;
      var ny = 0.5 * (1 - rTop);
      var nl = Math.hypot(1, ny);
      pushFace(P, N, I,
        [[x0, -0.5, z0], [x1, -0.5, z1], [t1x, 0.5, t1z], [t0x, 0.5, t0z]],
        mx / ml / nl, ny / nl, mz / ml / nl);
      if (caps) {
        var b = P.length / 3;
        P.push(0, 0.5, 0, t0x, 0.5, t0z, t1x, 0.5, t1z);
        N.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
        I.push(b, b + 1, b + 2);
        b = P.length / 3;
        P.push(0, -0.5, 0, x1, -0.5, z1, x0, -0.5, z0);
        N.push(0, -1, 0, 0, -1, 0, 0, -1, 0);
        I.push(b, b + 1, b + 2);
      }
    }
    return { P: P, N: N, I: I };
  }

  function sphereMesh(rings, seg) {
    var P = [], N = [], I = [], y, x;
    for (y = 0; y <= rings; y++) {
      var phi = (y / rings) * Math.PI;
      for (x = 0; x <= seg; x++) {
        var th = (x / seg) * Math.PI * 2;
        var nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
        P.push(nx * 0.5, ny * 0.5, nz * 0.5);
        N.push(nx, ny, nz);
      }
    }
    for (y = 0; y < rings; y++) {
      for (x = 0; x < seg; x++) {
        var a = y * (seg + 1) + x, b = a + seg + 1;
        I.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    return { P: P, N: N, I: I };
  }

  function planeMesh(size) {
    var h = size / 2;
    return {
      P: [-h, 0, h, h, 0, h, h, 0, -h, -h, 0, -h],
      N: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0],
      I: [0, 1, 2, 0, 2, 3],
    };
  }

  /* --------------------------------------------------------------- shaders */

  var VS = [
    'attribute vec3 aPos;',
    'attribute vec3 aNrm;',
    'uniform mat4 uVP;',
    'uniform mat4 uM;',
    'uniform vec3 uNS;',   // 1/scale — turns mat3(uM) into a proper normal matrix
    'varying vec3 vN;',
    'varying vec3 vW;',
    'void main(){',
    '  vec4 w = uM * vec4(aPos,1.0);',
    '  vW = w.xyz;',
    '  vN = mat3(uM[0].xyz, uM[1].xyz, uM[2].xyz) * (aNrm * uNS);',
    '  gl_Position = uVP * w;',
    '}',
  ].join('\n');

  var FS = [
    'precision mediump float;',
    'varying vec3 vN;',
    'varying vec3 vW;',
    'uniform vec3 uColor;',
    'uniform vec3 uLight;',
    'uniform vec3 uSky;',
    'uniform vec3 uEye;',
    'uniform vec4 uRoad;',   // x half width, y finish z, z start z, w scroll
    'uniform float uMode;',
    'uniform float uGlow;',
    'uniform float uAlpha;',
    'float band(float v, float w){ return smoothstep(w, w*0.3, abs(v)); }',
    'void main(){',
    '  vec3 col = uColor;',
    '  float fog = smoothstep(140.0, 340.0, length(vW - uEye));',
    '  if (uMode > 1.5) {',                       // unlit: panels, shadows
    '    gl_FragColor = vec4(mix(col, uSky, fog * 0.7), uAlpha);',
    '    return;',
    '  }',
    '  if (uMode > 0.5) {',                       // the road
    '    vec2 p = vW.xz;',
    '    float W = uRoad.x;',
    '    float ax = abs(p.x);',
    '    float g = step(0.5, fract(p.y * 0.06 + 0.5 * step(0.0, p.x)));',
    '    vec3 grass = mix(vec3(0.35, 0.53, 0.27), vec3(0.30, 0.47, 0.23), g);',
    '    vec3 dirt = vec3(0.56, 0.52, 0.42);',
    '    float tile = step(0.5, fract(p.y * 0.42 + floor(p.x * 0.8) * 0.31));',
    '    vec3 asph = mix(vec3(0.275, 0.285, 0.315), vec3(0.30, 0.31, 0.34), tile);',
    '    col = grass;',
    '    col = mix(col, dirt, smoothstep(W + 3.4, W + 1.15, ax));',
    '    col = mix(col, asph, step(ax, W));',
    // lane dashes at ax = W/3 (three lanes), edge lines, kerbs
    '    float dash = band(ax - W / 3.0, 0.14) * step(0.55, fract(p.y * 0.10)) * step(ax, W);',
    '    col = mix(col, vec3(0.93, 0.93, 0.88), dash);',
    '    float edge = band(ax - (W - 0.5), 0.11) * step(ax, W);',
    '    col = mix(col, vec3(0.95, 0.95, 0.90), edge);',
    '    float kerb = step(ax, W + 1.15) * step(W, ax);',
    '    float kt = step(0.5, fract(p.y * 0.16));',
    '    col = mix(col, mix(vec3(0.93, 0.91, 0.88), vec3(0.85, 0.22, 0.22), kt), kerb);',
    // start bar and checkered finish band
    '    float start = step(abs(p.y - uRoad.z), 0.9) * step(ax, W);',
    '    col = mix(col, vec3(0.95, 0.95, 0.92), start);',
    '    float ch = mod(floor(p.x * 0.6) + floor(p.y * 0.6), 2.0);',
    '    float fin = step(abs(p.y - uRoad.y), 2.1) * step(ax, W + 1.15);',
    '    col = mix(col, mix(vec3(0.09, 0.10, 0.12), vec3(0.96, 0.96, 0.96), ch), fin);',
    '  }',
    '  vec3 n = normalize(vN);',
    '  float diff = max(dot(n, normalize(uLight)), 0.0);',
    '  float sky = 0.5 + 0.5 * n.y;',
    '  vec3 lit = col * (0.44 + 0.20 * sky + 0.52 * diff);',
    '  lit += uGlow * col;',
    '  gl_FragColor = vec4(mix(lit, uSky, fog), 1.0);',
    '}',
  ].join('\n');

  /* -------------------------------------------------------------- renderer */

  function Renderer(canvas, sky) {
    var gl = canvas.getContext('webgl', {
      alpha: false, antialias: true, depth: true, powerPreference: 'high-performance',
    }) || canvas.getContext('experimental-webgl', { alpha: false, antialias: true });
    if (!gl) return null;

    function shader(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(s));
      }
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.bindAttribLocation(prog, 1, 'aNrm');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('link: ' + gl.getProgramInfoLog(prog));
    }
    gl.useProgram(prog);

    var U = {};
    ['uVP', 'uM', 'uColor', 'uLight', 'uSky', 'uEye', 'uRoad', 'uMode', 'uGlow', 'uAlpha', 'uNS']
      .forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
    gl.enableVertexAttribArray(0);
    gl.enableVertexAttribArray(1);
    gl.enable(gl.DEPTH_TEST);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);          // meshes are cheap; two-sided keeps panels simple
    gl.clearColor(sky[0], sky[1], sky[2], 1);

    function upload(m) {
      var pos = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, pos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.P), gl.STATIC_DRAW);
      var nrm = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, nrm);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(m.N), gl.STATIC_DRAW);
      var idx = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
      var big = m.P.length / 3 > 65535;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,
        big ? new Uint32Array(m.I) : new Uint16Array(m.I), gl.STATIC_DRAW);
      return {
        pos: pos, nrm: nrm, idx: idx, count: m.I.length,
        type: big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
      };
    }

    var meshes = {
      box: upload(boxMesh()),
      cyl: upload(tubeMesh(14, 1, true)),
      cone: upload(tubeMesh(14, 0.05, true)),
      pyr: upload(tubeMesh(4, 0.02, true)),
      taper: upload(tubeMesh(14, 0.6, true)),
      sphere: upload(sphereMesh(9, 12)),
      disc: upload(tubeMesh(20, 1, true)),
      ground: upload(planeMesh(900)),
    };

    var proj = mat4(), view = mat4(), vp = mat4(), mm = mat4();
    var lastMesh = null;
    var eye = [0, 6, -12];

    var api = {
      gl: gl,
      meshes: meshes,

      resize: function (w, h, dpr) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        gl.viewport(0, 0, canvas.width, canvas.height);
        perspective(proj, 0.9, canvas.width / canvas.height, 0.4, 520);
      },

      /** Alpha blending with no depth writes — panels, shadows, smoke. */
      blend: function (on) {
        if (on) { gl.enable(gl.BLEND); gl.depthMask(false); }
        else { gl.disable(gl.BLEND); gl.depthMask(true); }
      },

      camera: function (ex, ey, ez, tx, ty, tz) {
        eye[0] = ex; eye[1] = ey; eye[2] = ez;
        lookAt(view, ex, ey, ez, tx, ty, tz);
        multiply(vp, proj, view);
      },

      /** World point -> {x, y} in CSS pixels of the canvas. */
      project: function (x, y, z, w, h) {
        var cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
        var cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
        var cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
        if (cw <= 0.0001) return null;
        return { x: (cx / cw * 0.5 + 0.5) * w, y: (0.5 - cy / cw * 0.5) * h, d: cw };
      },

      begin: function (halfWidth, finishZ, startZ) {
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.uniformMatrix4fv(U.uVP, false, vp);
        gl.uniform3f(U.uLight, 0.38, 0.84, -0.38);
        gl.uniform3fv(U.uSky, sky);
        gl.uniform3fv(U.uEye, eye);
        gl.uniform4f(U.uRoad, halfWidth, finishZ, startZ, 0);
      },

      /** obj: {mesh, mat} or {mesh,x,y,z,rx,ry,rz,sx,sy,sz}, plus color/mode/glow/alpha */
      draw: function (o) {
        var m = meshes[o.mesh];
        if (!m) return;
        var ns = o.ns;
        if (o.mat) {                          // pre-composed matrix (car parts)
          gl.uniformMatrix4fv(U.uM, false, o.mat);
          if (!ns) ns = [1, 1, 1];
        } else {
          if (!ns) ns = [1 / o.sx, 1 / o.sy, 1 / o.sz];
          model(mm, o.x, o.y, o.z, o.rx || 0, o.ry || 0, o.rz || 0, o.sx, o.sy, o.sz);
          gl.uniformMatrix4fv(U.uM, false, mm);
        }
        gl.uniform3f(U.uNS, ns[0], ns[1], ns[2]);
        gl.uniform3fv(U.uColor, o.color);
        gl.uniform1f(U.uMode, o.mode || 0);
        gl.uniform1f(U.uGlow, o.glow || 0);
        gl.uniform1f(U.uAlpha, o.alpha === undefined ? 1 : o.alpha);
        if (m !== lastMesh) {                 // runs of the same mesh are common
          lastMesh = m;
          gl.bindBuffer(gl.ARRAY_BUFFER, m.pos);
          gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ARRAY_BUFFER, m.nrm);
          gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.idx);
        }
        gl.drawElements(gl.TRIANGLES, m.count, m.type, 0);
      },
    };
    return api;
  }

  global.Engine = { Renderer: Renderer, mat4: mat4, model: model, multiply: multiply };
})(window);
