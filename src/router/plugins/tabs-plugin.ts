import type { ProRouterPlugin } from '@pro/router'
import type { RouteLocationNormalized } from 'vue-router'
import { isEqualRoute } from '@pro/router'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@/store/use-layout-store'
import { ROOT_ROUTE_NAME } from '../routes'

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * 是否固定在多页签中
     */
    fixedInTabs?: boolean
  }
}

/**
 * tabs 相关处理插件，这个插件与 admin 强关联，所以不放在 @pro/router 中
 */
export function tabsPlugin(): ProRouterPlugin {
  return ({ router }) => {
    const {
      tabsPersist,
    } = storeToRefs(useLayoutStore())

    const {
      routes,
      guards,
      activeIndex,
    } = router.visitedRoutesPlugin

    // 如果不是 layout 页面中的路由，则跳过添加
    guards.beforeAdd((route) => {
      if (route.matched[0].name !== ROOT_ROUTE_NAME) {
        return false
      }
      return route
    })

    // 如果当前关闭的标签页是已固定的，则阻止关闭
    guards.beforeRemove((index) => {
      if (routes[index]?.meta?.fixedInTabs) {
        return false
      }
      return index
    })

    // 标签页持久化
    if (tabsPersist.value) {
      const off = guards.beforeAdd((route) => {
        const [finalIndex, finalTabs] = resolveActiveIndexAndTabs(route)
        Object.assign(routes, finalTabs)
        activeIndex.value = finalIndex
        off()
        return false
      })
    }
    useEventListener('beforeunload', () => {
      // 需要 map 处理一下，matched 存在循环引用，导致 JSON.stringify 报错
      tabsPersist.value
        ? localStorage.setItem('tabs', JSON.stringify(routes.map(item => ({ ...item, matched: [] }))))
        : localStorage.removeItem('tabs')
    })
  }
}

function getTabsFromStorage(): RouteLocationNormalized[] {
  const tabs = localStorage.getItem('tabs')
  if (tabs) {
    return JSON.parse(tabs)
  }
  return []
}

function resolveActiveIndexAndTabs(route: RouteLocationNormalized): [number, RouteLocationNormalized[]] {
  const cachedTabs = getTabsFromStorage()
  const index = cachedTabs.findIndex(item => isEqualRoute(item, route))
  if (~index) {
    return [
      index,
      cachedTabs,
    ]
  }
  const finalTabs = [...cachedTabs, route]
  return [
    finalTabs.length - 1,
    finalTabs,
  ]
}
