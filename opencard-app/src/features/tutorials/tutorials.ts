import type { TutorialDefinition } from '../../shared/ui/tutorial/tutorial'

/** 所有教程只在这里定义；业务代码主动调用 store，不在配置中嵌入业务条件。 */
export const tutorials = {
  overview: {
    title: 'tutorial.overview.title',
    blockInteraction: true,
    steps: [
      {
        id: 'welcome', manual: true, targets: [], nextLabel: 'tutorial.overview.start', exitLabel: 'tutorial.later',
        message: { title: 'tutorial.overview.welcome.title', desc: 'tutorial.overview.welcome.desc' },
      },
      ...['navigation', 'sidebar', 'content', 'titlebar', 'bottom-panel', 'sidebar-toggle'].map(key => ({
        id: key, manual: true, blockInteraction: !['titlebar', 'sidebar-toggle'].includes(key),
        targets: (key === 'titlebar' ? ['titlebar-menus', 'titlebar-tasks', 'titlebar-notices'] : [key])
          .map(target => ({ key: `shell.${target}`, title: `tutorial.overview.${target}.title`, desc: `tutorial.overview.${target}.desc`,
            interactive: target !== 'titlebar-menus' })),
      })),
      {
        id: 'new-project', manual: true, blockInteraction: false,
        targets: [{ key: 'welcome.new-project', title: 'tutorial.overview.newProject.title', desc: 'tutorial.overview.newProject.desc' }],
      },
    ],
  },
  welcome: {
    title: 'tutorial.welcome.title',
    steps: [
      {
        id: 'template', manual: true,
        targets: [{ key: 'create-project.templates', title: 'tutorial.welcome.template.title', desc: 'tutorial.welcome.template.desc' }],
      },
      {
        id: 'packages', manual: true,
        targets: [{ key: 'create-project.packages', title: 'tutorial.welcome.packages.title', desc: 'tutorial.welcome.packages.desc' }],
      },
      {
        id: 'details', manual: true,
        targets: [
          { key: 'create-project.name', title: 'tutorial.welcome.name.title', desc: 'tutorial.welcome.name.desc' },
          { key: 'create-project.location', title: 'tutorial.welcome.location.title', desc: 'tutorial.welcome.location.desc' },
        ],
      },
      {
        id: 'create-project',
        targets: [{ key: 'create-project.submit', title: 'tutorial.welcome.create.title', desc: 'tutorial.welcome.create.desc' }],
      },
    ],
  },
} satisfies Record<string, TutorialDefinition>
