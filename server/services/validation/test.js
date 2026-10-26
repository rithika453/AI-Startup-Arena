// Run with:  node server/services/validation/test.js
const { generateTasks } = require("./taskGenerator");
const v1 = require("./samples/sample-v1.json");

const tasks = generateTasks(v1);
console.log("Number of tasks:", tasks.length);
console.table(tasks.map(t => ({
  weaknessId: t.weaknessId,
  agent: t.agent,
  priority: t.priority,
  title: t.title,
})));
console.log("First task in full:");
console.log(tasks[0]);
