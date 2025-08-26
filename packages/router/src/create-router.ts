import type { App, EffectScope } from 'vue'
import type { RouterOptions as _RouterOptions, Router } from 'vue-router'
import type { ProRouterObjectPlugin, ProRouterPlugin, ProRouterPluginCleanupHandler, ProRouterPluginRunWithAppHandler, ProRouterPluginUnmountHandler } from './plugin'
import { effectScope } from 'vue'
import { createRouter as _createRouter } from 'vue-router'
import { setupPlugin } from './plugin'
import { normalizeRoutesPlugin } from './plugins/normalize-routes-plugin'
import { ALREADY_INSTALLED, APP, EFFECT_SCOPE, RUN_WITH_APP_HANDLERS, UNMOUNT_HANDLERS } from './symbols'

export interface ProRouterOptions extends _RouterOptions {
  plugins?: ProRouterPlugin[]
}

export function createRouter(options: ProRouterOptions): Router {
  const {
    vrOptions,
    plugins = [],
    pluginCleanups,
  } = resolveOptions(options)

  console.log('vrOptions >', vrOptions)

  const router = _createRouter(vrOptions)
  const scope = (router[EFFECT_SCOPE] ??= effectScope(true))

  const {
    install,
    onError,
    afterEach,
    beforeEach,
    beforeResolve,
  } = router

  router.install = (...args) => {
    const [app] = args
    prepareInstall(app, router)
    install.call(router, ...args)
    const runWithAppHandlers = (router[RUN_WITH_APP_HANDLERS] ??= [])
    runWithAppHandlers.forEach(handler => handler(app))
    runWithAppHandlers.length = 0
  }

  router.beforeEach = (guard, ...rest) => {
    return beforeEach((...args) => {
      return scope.run(() => {
        return guard.call(undefined, ...args)
      })
    }, ...rest)
  }

  router.beforeResolve = (guard, ...rest) => {
    return beforeResolve((...args) => {
      return scope.run(() => {
        return guard.call(undefined, ...args)
      })
    }, ...rest)
  }

  router.afterEach = (guard, ...rest) => {
    return afterEach((...args) => {
      return scope.run(() => {
        return guard.call(undefined, ...args)
      })
    }, ...rest)
  }

  router.onError = (handler, ...rest) => {
    return onError((...args) => {
      return scope.run(() => {
        return handler.call(undefined, ...args)
      })
    }, ...rest)
  }

  router.runPluginsCleanup = () => {
    pluginCleanups.forEach(cleanup => cleanup())
  }

  plugins.forEach((plugin) => {
    setupPlugin({ router, plugin })
  })

  return router
}

function prepareInstall(app: App, router: Router) {
  if (router[ALREADY_INSTALLED]) {
    return
  }
  router[APP] = app
  router[ALREADY_INSTALLED] = true

  app.onUnmount(() => {
    router[EFFECT_SCOPE]?.stop()
    router[UNMOUNT_HANDLERS]?.forEach(handler => handler())
    delete router[APP]
    delete router[EFFECT_SCOPE]
    delete router[UNMOUNT_HANDLERS]
    delete router[ALREADY_INSTALLED]
    delete router[RUN_WITH_APP_HANDLERS]
    delete router.runPluginsCleanup
  })
}

function resolveOptions(options: ProRouterOptions) {
  const pluginCleanups: ProRouterPluginCleanupHandler[] = []

  console.log('options >', options)
  // options >> history routes plugins
  // vueRouterOptions >> history routes
  const {
    plugins = [],
    ...vueRouterOptions
  } = options

  const builtinPlugins = [
    normalizeRoutesPlugin(),
  ]

  console.log('builtinPlugins >', builtinPlugins)

  const objectPlugins = [
    ...builtinPlugins,
    ...plugins,
  ].map(plugin => convertToObjectPlugin(plugin, pluginCleanups))

  console.log('objectPlugins >', objectPlugins)
  const finalVrOptions = objectPlugins.reduce((p, c) => {
    if (c.resolveOptions) {
      return c.resolveOptions(p)
    }
    return p
  }, vueRouterOptions)

  return {
    pluginCleanups,
    plugins: objectPlugins,
    vrOptions: finalVrOptions,
  }
}

function convertToObjectPlugin(
  plugin: ProRouterPlugin,
  pluginCleanups: ProRouterPluginCleanupHandler[],
): ProRouterObjectPlugin {
  if (typeof plugin === 'function') {
    return {
      install: (...args) => {
        const exposed = plugin(...args)
        if (exposed && exposed.onCleanup) {
          pluginCleanups.push(exposed.onCleanup)
        }
        return exposed
      },
    }
  }
  return plugin
}

declare module 'vue-router' {
  export interface Router {
    /**
     * Vue 实例
     */
    [APP]?: App
    /**
     * vueInstance.effectScope
     */
    [EFFECT_SCOPE]?: EffectScope
    /**
     * 插件的 onUnmount 钩子集合
     */
    [UNMOUNT_HANDLERS]?: ProRouterPluginUnmountHandler[]
    /**
     * 插件的 runWithApp 钩子集合
     */
    [RUN_WITH_APP_HANDLERS]?: ProRouterPluginRunWithAppHandler[]
    /**
     * 是否已经安装
     */
    [ALREADY_INSTALLED]?: boolean
    /**
     * 运行所有已注册的插件中返回的 onCleanup 钩子
     */
    runPluginsCleanup: ProRouterPluginCleanupHandler
  }
}
