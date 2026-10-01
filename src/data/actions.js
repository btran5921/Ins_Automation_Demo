const actions = [];

let counter = 0;

function nextActionId() {
  counter += 1;
  return `action_${String(counter).padStart(3, "0")}`;
}

module.exports = { actions, nextActionId };