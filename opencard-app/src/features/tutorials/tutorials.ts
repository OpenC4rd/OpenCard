import type { TutorialDefinition } from '../../shared/ui/tutorial/tutorial'

const overviewMessageNames: Record<string, string> = {
  'titlebar-menus': 'titlebarMenus', 'titlebar-tasks': 'titlebarTasks', 'titlebar-notices': 'titlebarNotices',
  'bottom-panel': 'bottomPanel', 'sidebar-toggle': 'sidebarToggle',
}

/** 所有教程只在这里定义；业务代码主动调用 store，不在配置中嵌入业务条件。 */
export const tutorials = {
  overview: {
    title: 'tutorial.overview.title',
    blockInteraction: true,
    steps: [
      {
        id: 'welcome', manual: true, targets: [], nextLabel: 'tutorial.overview.start', exitLabel: 'tutorial.later',
        message: { title: 'tutorial.overview.welcome.title', desc: 'tutorial.overview.welcome.description' },
      },
      {
        id: 'interaction', manual: true, targets: [],
        message: { title: 'tutorial.overview.interaction.title', desc: 'tutorial.overview.interaction.description' },
      },
      ...['navigation', 'sidebar', 'content', 'titlebar', 'bottom-panel', 'sidebar-toggle'].map(key => ({
        id: key, manual: true, blockInteraction: !['titlebar', 'sidebar-toggle'].includes(key),
        targets: (key === 'titlebar' ? ['titlebar-menus', 'titlebar-tasks', 'titlebar-notices'] : [key])
          .map(target => {
            const name = overviewMessageNames[target] ?? target
            return { key: `shell.${target}`, title: `tutorial.overview.${name}.title`, desc: `tutorial.overview.${name}.description`,
              interactive: target !== 'titlebar-menus' }
          }),
      })),
      {
        id: 'new-project', manual: true, blockInteraction: false,
        targets: [{ key: 'welcome.new-project', title: 'tutorial.overview.newProject.title', desc: 'tutorial.overview.newProject.description' }],
      },
    ],
  },
  welcome: {
    title: 'tutorial.createProject.title',
    steps: [
      {
        id: 'template', manual: true,
        targets: [{ key: 'create-project.templates', title: 'tutorial.createProject.template.title', desc: 'tutorial.createProject.template.description' }],
      },
      {
        id: 'packages', manual: true,
        targets: [{ key: 'create-project.packages', title: 'tutorial.createProject.packages.title', desc: 'tutorial.createProject.packages.description' }],
      },
      {
        id: 'details', manual: true,
        targets: [
          { key: 'create-project.name', title: 'tutorial.createProject.name.title', desc: 'tutorial.createProject.name.description' },
          { key: 'create-project.location', title: 'tutorial.createProject.location.title', desc: 'tutorial.createProject.location.description' },
        ],
      },
      {
        id: 'create-project',
        targets: [{ key: 'create-project.submit', title: 'tutorial.createProject.create.title', desc: 'tutorial.createProject.create.description' }],
      },
    ],
  },
  workbench: {
    title: 'tutorial.workbench.title',
    blockInteraction: true,
    steps: [
      ...['files', 'management'].map(key => ({
        id: key, manual: true,
        targets: [{ key: `workbench.${key}`, title: `tutorial.workbench.${key}.title`, desc: `tutorial.workbench.${key}.description` }],
      })),
      {
        id: 'collaboration', blockInteraction: false,
        targets: [{ key: 'shell.collaboration', title: 'tutorial.workbench.collaboration.title', desc: 'tutorial.workbench.collaboration.description' }],
      },
    ],
  },
  initializeVersionControl: {
    title: 'tutorial.initializeVersionControl.title',
    steps: [
      {
        id: 'initialize',
        targets: [{ key: 'collaboration.initialize', title: 'tutorial.initializeVersionControl.title', desc: 'tutorial.initializeVersionControl.description' }],
      },
    ],
  },
  versionControl: {
    title: 'tutorial.versionControl.title',
    blockInteraction: true,
    steps: [
      ...['sidebar', 'graph', 'changes', 'commit'].map(key => ({
        id: key, manual: true,
        targets: [{ key: key === 'sidebar' ? 'shell.sidebar' : `collaboration.${key}`,
          title: `tutorial.versionControl.${key}.title`, desc: `tutorial.versionControl.${key}.description` }],
      })),
      {
        id: 'git', manual: true, targets: [],
        message: { title: 'tutorial.versionControl.git.title', desc: 'tutorial.versionControl.git.description' },
      },
    ],
  },
} satisfies Record<string, TutorialDefinition>
