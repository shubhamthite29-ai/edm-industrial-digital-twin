import fs from "node:fs";

const artifact = JSON.parse(fs.readFileSync("src/data/ml/frozen-research-model.json", "utf8"));
const cases = JSON.parse(fs.readFileSync("ml/tests/fixtures/shailesh_browser_parity_cases.json", "utf8"));

function predict(forest, input) {
  const vector = [input.current_A, input.voltage_V, input.ton_us, input.electrode_coating === "AlCrNi (PVD)" ? 1 : 0];
  return forest.trees.reduce((sum, tree) => {
    let node = 0;
    while (tree.children_left[node] !== -1) node = vector[tree.feature[node]] <= tree.threshold[node] ? tree.children_left[node] : tree.children_right[node];
    return sum + tree.value[node];
  }, 0) / forest.trees.length;
}

let maximumMrrDifference = 0;
let maximumTwrDifference = 0;
for (const sample of cases) {
  maximumMrrDifference = Math.max(maximumMrrDifference, Math.abs(predict(artifact.mrr_model, sample.input) - sample.python_mrr));
  maximumTwrDifference = Math.max(maximumTwrDifference, Math.abs(predict(artifact.twr_model, sample.input) - sample.python_twr));
}
if (maximumMrrDifference > 1e-12 || maximumTwrDifference > 1e-12) throw new Error(`Python/browser parity failure: MRR ${maximumMrrDifference}, TWR ${maximumTwrDifference}`);
process.stdout.write(JSON.stringify({ cases: cases.length, maximumMrrDifference, maximumTwrDifference }));
