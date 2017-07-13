const fs = require('fs');
const read = file => fs.readFileSync(file, 'utf-8');

const PREFIX = `/brigand/CarteJaune/blob/master`;
// const PREFIX = `/nikgraf/CarteJaune/blob/master/actions/addVaccinationSuccess.js`;

const dirs = ['actions', 'components', 'constants', 'containers', 'reducers', 'sagas', 'selectors'];

const files = dirs.reduce((acc, dir) => {
  acc[dir] = fs
    .readdirSync(dir)
    .filter(file => !fs.statSync(`${dir}/${file}`).isDirectory())
    .map(file => ({
      dir,
      file,
      loc: `${dir}/${file}`,
      name: file.split('.').shift(),
      read: () => read(`${dir}/${file}`),
    }));
  return acc;
}, {});

function getNames() {
  const s = files.constants.find(x => x.name === 'actions').read();
  return s.match(/'[^']+'/g).map(x => x.replace(/'/g, ''));
}

function getActions() {
  return files.actions.map((file) => {
    const s = file.read();
    return s.split('\n').map((line, i) => {
      const match = line.match(/type: ([A-Z_]+)/);
      if (!match) return null;
      const type = match[1];
      return {
        name: file.name,
        type,
        line: i,
      };
    }).filter(Boolean)[0];

  });
}

function getStateTree() {
  const file = files.reducers.find(x => x.name === 'index');
  const s = file.read();
  const match = s.match(/combineReducers\(\{([^}]+)\}/);
  if (!match) {
    console.error(`reducers/index.js failed to match combineReducers`);
    process.exit(7);
  }

  const keys = match[1].split(',').map(x => x.trim()).filter(Boolean);
  return keys.map(x => ({key: x, reducer: x}));
}

function getReducers() {
  return files.reducers.filter(x => x.name !== 'index').map(file => {
    const actions = [];
    const s = file.read();
    const lines = s.split('\n');
    lines.forEach((line, i) => {
      const match = line.match(/case ([A-Z_]+)/);
      if (match) {
        actions.push({type: match[1], line: i});
      }
    });
    return {name: file.name, actions};
  });
}


function getContainers() {
  return files.containers.map((file) => {
    const actions = [];
    let inActions = false;
    file.read().split('\n').forEach((line, i, lines) => {
      if (inActions) {
        if (line[0] === '}') {
          inActions = false;
          return;
        }
        const match = line.match(/(\w+)/);
        if (match) {
          actions.push({type: match[1], line: i});
        }
      } else if (/const actions =/.test(line)) {
        inActions = true;
      }
    });
    return {name: file.name, loc: file.loc, actions};
  });
}

function getSagas() {
  return files.sagas.filter(x => x.name !== 'index').map((file) => {
    const saga = {name: file.name, actions: []};
    file.read().split('\n').forEach((line, i) => {
      const match = line.match(/take\w*\(([A-Z_]+)/);
      if (match) {
        saga.actions.push({type: match[1], line: i});
      }
    });
    return saga;
  });
}

function simplify({actionNames, actions, stateTree, reducers, sagas}) {
  const res = {};
  actions.forEach((action) => {
    const data = {};
    data.type = action.type;
    data.name = action.name;
    data.line = action.line;
    data.reducers = reducers
      .map(x => {
        const act = x.actions.find(x => x.type === action.type);
        if (!act) return null;
        return {name: x.name, line: act.line};
      }).filter(Boolean);
    data.sagas = sagas.map(x => {
      const act = x.actions.find(y => y.type === action.type);
      if (!act) return null;
      return {name: x.name, action: act};
    }).filter(Boolean);

    res[action.type] = data;
  });
  return res;
}

function getMarkdown(data) {
  let str = ``;

  Object.keys(data).forEach((name) => {
    const x = data[name];
    let section = ``;
    section += `## ${name}\n\n`;
    section += `**Action Creator:** [${x.name}](${PREFIX}/actions/${x.name}.js#L${x.line})\n\n`;
    section += `**Reducers:**\n\n`;
    x.reducers.forEach((reducer) => {
      const name = `[${reducer.name}]`;
      const url = `(${PREFIX}/reducers/${reducer.name}.js#L${reducer.line})`;
      section += ` - ${name}${url}\n`;
    });

    section += `\n**Sagas:**\n\n`;
    x.sagas.forEach((saga) => {
      const name = `[${saga.name}]`;
      const url = `(${PREFIX}/reducers/${saga.name}.js#L${saga.action.line})`;
      section += ` - ${name}${url}\n`;
    });

    str += `\n${section}\n`;
  });

  return str;
}

const result = {};
result.actionNames = getNames();
result.actions = getActions();
result.stateTree = getStateTree();
result.reducers = getReducers();
result.containers = getContainers();
result.sagas = getSagas();


const test = simplify(result);
console.log(JSON.stringify(test, null, 2));

const md = getMarkdown(simplify(result));

fs.writeFileSync('docs/actions.md', md);

console.log(md);
