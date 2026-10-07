// CS405 · Lab 1 — a rotating square that follows the mouse.

const canvas = document.querySelector('canvas');
if (!navigator.gpu) throw new Error('WebGPU not available');

const adapter = await navigator.gpu.requestAdapter();
const device  = await adapter.requestDevice();

const ctx = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format, alphaMode: 'opaque' });
console.log('WebGPU ready:', format);

const SHADER = `
  // Byte offsets: time 0, padding 4, canvasSize 8, mouse 16, padding 24.
  struct U {
    time: f32,
    pad: f32,
    canvasSize: vec2f,
    mouse: vec2f,
    padEnd: vec2f,
  };
  @group(0) @binding(0) var<uniform> u: U;

  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) colour: vec4f
  };


  @vertex fn vs(@builtin(vertex_index) i: u32)
       -> VSOut {
    var positions = array<vec2f, 6>(
      vec2f(-0.5, -0.5),
      vec2f( 0.5, -0.5),
      vec2f( 0.5,  0.5),
      vec2f(-0.5, -0.5),
      vec2f( 0.5,  0.5),
      vec2f(-0.5,  0.5));
    
    var c = array<vec3f, 6>(
      vec3f(1.0, 0.0, 0.0),
      vec3f(0.0, 1.0, 0.0),
      vec3f(0.0, 0.0, 1.0),
      vec3f(1.0, 0.0, 0.0),
      vec3f(0.0, 0.0, 1.0),
      vec3f(1.0, 1.0, 0.0));

      let a = u.time;
      // WGSL matrix arguments fill columns, not rows.
      let R = mat2x2f(
         cos(a), sin(a),
        -sin(a), cos(a)
      );
      let S = mat2x2f(
        1.5, 0.0,
        0.0, 0.6
      );

      var p = positions[i];
      // Lab experiments: keep exactly ONE of these four lines active.
      p = R * p;              // normal rotation (default)
      // p = R * S * p;       // scale first, then rotate
      // p = S * R * p;       // rotate first, then scale
      // p = transpose(R) * p; // opposite rotation

      // Correct for the current canvas dimensions after the local transform.
      p.x *= u.canvasSize.y / u.canvasSize.x;
      // Translate last so rotation stays around the square's own center.
      p += u.mouse;

      var out: VSOut;
      out.pos = vec4f(p, 0.0, 1.0);
      out.colour = vec4f(c[i], 1.0);
      return out;
  }
  @fragment fn fs(in: VSOut) -> @location(0) vec4f {
    return in.colour;
  }` ;

const module = device.createShaderModule({ code: SHADER });

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: { module, entryPoint: 'vs' },
  fragment: { module, entryPoint: 'fs', targets: [{ format }] }
});


const ubuf = device.createBuffer({
  size: 32,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

const bind = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: ubuf } }]
});

// Match U: [time, padding, width, height, mouseX, mouseY, padding, padding].
// vec2f fields start on 8-byte boundaries; the buffer totals 32 bytes.
const uniformData = new Float32Array(8);

canvas.addEventListener('pointermove', (event) => {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  // Convert canvas coordinates to clip space, where positive Y points up.
  uniformData[4] = 2 * (event.clientX - r.left) / r.width - 1;
  uniformData[5] = 1 - 2 * (event.clientY - r.top) / r.height;
});

const t0 = performance.now();

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();

function frame() {

  const t = (performance.now() - t0) * 0.001;

  uniformData[0] = t;
  uniformData[2] = canvas.width;
  uniformData[3] = canvas.height;
  device.queue.writeBuffer(ubuf, 0, uniformData);

  const enc = device.createCommandEncoder();
  const pass = enc.beginRenderPass({ colorAttachments: [{
    view: ctx.getCurrentTexture().createView(),
    clearValue: { r: 0.19, g: 0.2, b: 0.6, a: 1 },
    loadOp: 'clear', storeOp: 'store' }] });

  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.draw(6);
  pass.end();

  device.queue.submit([enc.finish()]);

  requestAnimationFrame(frame);
}
frame();
