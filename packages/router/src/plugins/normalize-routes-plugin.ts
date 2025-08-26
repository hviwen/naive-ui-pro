import type { RouteLocationNormalizedGeneric, RouteRecordNameGeneric, RouteRecordRaw } from 'vue-router'
import type { ProRouterPlugin } from '../plugin'
import { ROUTE_COMPONENT_NAME, ROUTE_NAME } from '../symbols'
import { ensureRouteName, generateRouteComponentName, isRouteName } from '../utils/route'

declare module 'vue-router' {
  interface RouteMeta {
    [ROUTE_NAME]?: string | symbol
    [ROUTE_COMPONENT_NAME]?: string | undefined
  }
}

/**
 * 内置插件，不对外暴露，确保路由名称和对应的组件名称存在，供下游插件做一些功能
 */
export function normalizeRoutesPlugin(): ProRouterPlugin {
  return {
    resolveOptions: (options) => {
      return {
        ...options,
        routes: normalizeRoutes(options.routes as RouteRecordRaw[]),
      }
    },
    install: ({ router }) => {
      const originalAddRoute = router.addRoute

      router.addRoute = function addRoute(
        parentOrRoute: NonNullable<RouteRecordNameGeneric> | RouteRecordRaw,
        route?: RouteRecordRaw,
      ) {
        return isRouteName(parentOrRoute)
          ? originalAddRoute(parentOrRoute, normalizeRoutes([route!])[0])
          : originalAddRoute(normalizeRoutes([parentOrRoute])[0])
      }

      router.beforeResolve((to) => {
        const namespace = 'default'
        const normalizedComponent = normalizeRouteResolvedComponent(to, namespace)
        if (normalizedComponent) {
          const currentRoute = to.matched[to.matched.length - 1]
          currentRoute.components[namespace] = { ...normalizedComponent }
          currentRoute.meta = {
            ...currentRoute.meta,
            [ROUTE_COMPONENT_NAME]: normalizedComponent.__name,
          }
        }
      })
    },
  }
}

function normalizeRoutes(routes: RouteRecordRaw[], parents: RouteRecordRaw[] = []) {
  return routes.map((route) => {
    const routeName = ensureRouteName(route)
    console.log('routeName >>', routeName)
    const newRoute: RouteRecordRaw = {
      ...route,
      name: routeName,
      meta: {
        ...(route.meta ?? {}),
        [ROUTE_NAME]: routeName,
      },
    }
    if (newRoute.children && newRoute.children.length > 0) {
      newRoute.children = normalizeRoutes(newRoute.children, [...parents, newRoute])
    }
    return newRoute
  })
}

function normalizeRouteResolvedComponent(
  route: RouteLocationNormalizedGeneric,
  namespace: string = 'default',
) {
  const currentRoute = route.matched[route.matched.length - 1]
  const currentRouteComponent = currentRoute?.components?.[namespace]
  console.log('currentRouteComponent >>', currentRouteComponent)
  if (!currentRouteComponent) {
    return
  }
  if (currentRouteComponent.name && currentRouteComponent.name !== (currentRouteComponent as any).__name) {
    return {
      ...currentRouteComponent,
      __name: currentRouteComponent.name,
    }
  }
  const newRouteComponentName = generateRouteComponentName(route)
  if (!currentRouteComponent.name && (currentRouteComponent as any).__name !== newRouteComponentName) {
    return {
      ...currentRouteComponent,
      __name: newRouteComponentName,
    }
  }
}
