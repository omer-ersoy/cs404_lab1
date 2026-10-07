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
  struct U {time: f32, aspect: f32, mouse: vec2f};
  @group(0) @binding(0) var<uniform> u: U;

  struct VSOut {
    @builtin(position) pos: vec4f,
    @location(0) colour: vec4f
  };


  @vertex fn vs(@builtin(vertex_index) i: u32)
       -> VSOut {
    var p = array<vec2f, 6>(
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
      let q = vec2f(p[i].x * cos(a) - p[i].y * sin(a),
                     p[i].x * sin(a) + p[i].y * cos(a));
      

      var out: VSOut;
      out.pos = vec4f(q / vec2f(u.aspect, 1.0) + u.mouse, 0.0, 1.0);
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
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

const bind = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: ubuf } }]
});

const uniformData = new Float32Array(4);

canvas.addEventListener('pointermove', (event) => {
  const r = canvas.getBoundingClientRect();
  if (!r.width || !r.height) return;
  // Convert canvas coordinates to clip space, where positive Y points up.
  uniformData[2] = 2 * (event.clientX - r.left) / r.width - 1;
  uniformData[3] = 1 - 2 * (event.clientY - r.top) / r.height;
});

const t0 = performance.now();

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
window.addEventListener('resize', resize);
resize();

function frame() {

  const t = (performance.now() - t0) * 0.001;

  uniformData[0] = t;
  uniformData[1] = canvas.width / canvas.height;
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
