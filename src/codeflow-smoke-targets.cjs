const SMOKE_TARGETS = {
  aichemist: {
    name: 'aichemist',
    repoUrl: 'http://192.168.1.134:30142/mmarinucci/AIchemist.git',
    auth: 'auto',
    maxFiles: 120,
    sections: ['summary'],
    description: 'Private Forgejo smoke target on the TrueNAS host',
  },
};

function listSmokeTargets() {
  return Object.values(SMOKE_TARGETS).map((target) => ({ ...target }));
}

function getSmokeTarget(name) {
  const targetName = (name || 'aichemist').toLowerCase();
  const target = SMOKE_TARGETS[targetName];
  if (!target) {
    throw new Error(`Unknown smoke target: ${name}`);
  }
  return {
    ...target,
    sections: [...target.sections],
  };
}

module.exports = {
  getSmokeTarget,
  listSmokeTargets,
};
