// Each pose contains head, shoulders, hips, elbows, hands, knees and feet in view coordinates.
const stand =
  "80,22 80,38 80,75 68,58 92,58 65,75 95,75 68,99 92,99 65,124 95,124";
const poses = {
  bench: [
    "43,65 60,68 99,68 41,78 79,78 42,57 78,57 117,88 110,88 118,110 110,110",
    "43,65 60,68 99,68 55,47 65,47 54,25 66,25 117,88 110,88 118,110 110,110",
  ],
  floor: [
    "40,101 57,105 95,105 38,108 78,108 38,89 78,89 109,83 114,83 123,109 129,109",
    "40,101 57,105 95,105 51,85 63,85 50,64 65,64 109,83 114,83 123,109 129,109",
  ],
  shoulder: [
    "80,26 80,42 80,77 56,47 104,47 55,25 105,25 68,100 92,100 64,124 96,124",
    "80,26 80,42 80,77 66,24 94,24 64,4 96,4 68,100 92,100 64,124 96,124",
  ],
  push: [
    "39,62 53,69 85,83 50,89 57,89 48,111 57,111 109,96 109,96 133,111 133,111",
    "32,89 48,92 84,99 65,99 69,99 48,111 57,111 109,105 109,105 133,111 133,111",
  ],
  triceps: [
    "80,32 80,47 80,80 70,25 74,23 58,39 60,39 68,103 92,103 65,125 95,125",
    "80,32 80,47 80,80 70,25 74,23 66,5 68,5 68,103 92,103 65,125 95,125",
  ],
  row: [
    "44,44 58,54 93,69 55,73 64,73 61,91 66,93 64,96 104,96 55,123 114,123",
    "44,44 58,54 93,69 55,73 88,50 61,91 77,70 64,96 104,96 55,123 114,123",
  ],
  fly: [
    "80,45 80,57 80,73 67,75 93,75 63,94 97,94 65,99 95,99 60,123 100,123",
    "80,45 80,57 80,73 55,58 105,58 34,54 126,54 65,99 95,99 60,123 100,123",
  ],
  curl: [
    stand,
    "80,22 80,38 80,75 68,57 92,57 56,40 104,40 68,99 92,99 65,124 95,124",
  ],
  hammer: [
    "74,23 79,39 80,76 76,59 85,59 74,78 83,78 72,100 88,100 68,124 92,124",
    "74,23 79,39 80,76 76,59 85,59 64,44 73,44 72,100 88,100 68,124 92,124",
  ],
  squat: [
    "78,22 80,38 82,75 66,54 92,54 74,39 79,39 69,99 95,99 65,124 101,124",
    "69,52 73,68 89,94 59,83 85,83 67,69 72,69 55,98 103,98 65,124 101,124",
  ],
  rdl: [
    stand,
    "43,57 59,63 94,74 58,83 66,83 61,103 69,103 75,99 92,99 65,124 95,124",
  ],
  lunge: [
    stand,
    "66,45 70,61 73,89 59,77 84,77 66,87 76,87 48,94 100,115 47,124 124,124",
  ],
  calf: [
    stand,
    "80,15 80,31 80,68 68,51 92,51 65,68 95,68 68,92 92,92 65,117 95,117",
  ],
  bug: [
    "37,99 53,102 91,104 52,82 58,82 51,63 58,63 89,81 96,81 111,81 118,81",
    "37,99 53,102 91,104 32,94 58,82 12,89 58,63 89,81 113,98 111,81 137,97",
  ],
  plank: [
    "39,70 54,78 87,104 52,103 74,89 32,104 85,102 111,105 111,105 136,106 136,106",
    "39,61 54,70 87,85 52,103 72,78 32,104 85,84 111,96 111,96 136,106 136,106",
  ],
};
export const demoIds = Object.keys(poses);
const edges = [
  [1, 2],
  [1, 3],
  [3, 5],
  [1, 4],
  [4, 6],
  [2, 7],
  [7, 9],
  [2, 8],
  [8, 10],
];
export function drawing(id, t) {
  let [a, b] = poses[id].map((frame) =>
    frame.split(" ").map((p) => p.split(",").map(Number)),
  );
  if (id === "bug" && t > 1) {
    t -= 1;
    for (const pair of [
      [3, 4],
      [5, 6],
      [7, 8],
      [9, 10],
    ]) {
      const [i, j] = pair;
      [b[i], b[j]] = [b[j], b[i]];
    }
  }
  const points = a.map((p, i) => p.map((v, j) => v + (b[i][j] - v) * t));
  const line = (p, q, color, w) =>
    '<line x1="' +
    p[0] +
    '" y1="' +
    p[1] +
    '" x2="' +
    q[0] +
    '" y2="' +
    q[1] +
    '" stroke="' +
    color +
    '" stroke-width="' +
    w +
    '" stroke-linecap="round"/>';
  let svg =
    id === "bench"
      ? '<path d="M30 78h76m-65 0v31m54-31v31" stroke="#64748b" fill="none" stroke-width="5"/>'
      : "";
  if (["push", "floor", "plank", "bug"].includes(id))
    svg += line(
      [12, id === "push" || id === "floor" ? 112 : 109],
      [148, id === "push" || id === "floor" ? 112 : 109],
      "#64748b",
      2,
    );
  svg += edges
    .map(([i, j]) =>
      line(
        points[i],
        points[j],
        j === 3 || j === 5 || j === 7 || j === 9 ? "#458aa5" : "#186955",
        j === 2 ? 9 : 5,
      ),
    )
    .join("");
  svg +=
    line(points[0], points[1], "#186955", 5) +
    '<circle cx="' +
    points[0][0] +
    '" cy="' +
    points[0][1] +
    '" r="7" fill="#d28d56"/>';
  if (id === "calf")
    for (const i of [9, 10])
      svg += line(points[i], [points[i][0] - 8, 125], "#186955", 4);
  if (!["push", "bug", "plank", "calf", "lunge"].includes(id))
    for (const i of ["squat", "row", "triceps"].includes(id) ? [6] : [5, 6]) {
      const [x, y] = points[i],
        vertical = ["hammer", "squat", "triceps"].includes(id);
      svg +=
        '<g transform="translate(' +
        x +
        " " +
        y +
        ") rotate(" +
        (vertical ? 90 : 0) +
        ')" fill="#263b4c"><rect x="-7" y="-1.5" width="14" height="3"/><rect x="-8" y="-4" width="4" height="8"/><rect x="4" y="-4" width="4" height="8"/></g>';
    }
  return svg;
}
export function demo(e, reduce) {
  if (!poses[e.demo]) return "<p>此自訂動作尚無演示。</p>";
  const frame = (t) =>
    '<svg aria-label="動作姿勢" viewBox="0 0 160 134">' +
    drawing(e.demo, t) +
    "</svg>";
  return (
    '<div class="demo" data-demo="' +
    e.demo +
    '">' +
    (reduce ? frame(0) + frame(1) : frame(0)) +
    "</div>" +
    (reduce
      ? "起始姿勢　／　終點姿勢"
      : '<div class="controls"><button data-ui="play">暫停</button><button data-ui="replay">重播</button><label><input id="loop" type="checkbox" checked>循環</label></div>')
  );
}
let handle = 0,
  running = false,
  elapsed = 0,
  last = 0;
export function stopDemo() {
  cancelAnimationFrame(handle);
  running = false;
  elapsed = 0;
  last = 0;
}
export function playDemo(reset = false) {
  const host = document.querySelector("[data-demo]"),
    loop = document.querySelector("#loop");
  if (!host || !loop) return;
  const button = document.querySelector('[data-ui="play"]');
  if (running && !reset) {
    cancelAnimationFrame(handle);
    running = false;
    last = 0;
    button.textContent = "播放";
    return;
  }
  cancelAnimationFrame(handle);
  if (reset) elapsed = 0;
  running = true;
  last = 0;
  button.textContent = "暫停";
  function tick(now) {
    if (!running) return;
    elapsed += last ? now - last : 0;
    last = now;
    const id = host.dataset.demo,
      period = id === "bug" ? 6400 : 3200;
    if (elapsed >= period && !loop.checked) {
      elapsed = 0;
      running = false;
      last = 0;
      button.textContent = "播放";
    }
    const phase = (elapsed % 3200) / 3200;
    let t = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    if (id === "plank") t = Math.min(1, t * 3);
    if (id === "bug" && elapsed % 6400 >= 3200) t += 1;
    host.firstElementChild.innerHTML = drawing(id, t);
    if (running) handle = requestAnimationFrame(tick);
  }
  handle = requestAnimationFrame(tick);
}
