"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Spade,
  Dices,
  Coins,
  History,
  Trophy,
  BarChart2,
  Gift,
  Crown,
  Settings,
  HelpCircle,
  Menu,
  ChevronLeft,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip"

const navigation = [
  { name: "Mitt konto", href: "/", icon: LayoutDashboard },
  { name: "Blackjack", href: "/blackjack", icon: Spade },
  { name: "Roulette", href: "/roulette", icon: Dices },
  { name: "Krediter", href: "/credits", icon: Coins },
  { name: "Spelhistorik", href: "/history", icon: History },
  { name: "Statistik", href: "/analytics", icon: BarChart2 },
  { name: "Prestationer", href: "/achievements", icon: Trophy },
  { name: "VIP-klubb", href: "/vip", icon: Crown },
  { name: "Bonusar", href: "/bonuses", icon: Gift },
]

const bottomNavigation = [
  { name: "Inställningar", href: "/settings", icon: Settings },
  { name: "Hjälp", href: "/help", icon: HelpCircle },
]

export function Sidebar() {
  const pathname = usePathname()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileOpen, setIsMobileOpen] = useState(false)

  const NavItem = ({ item, isBottom = false }) => (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          className={cn(
            "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === item.href
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
            isCollapsed && "justify-center px-2",
          )}
        >
          <item.icon className={cn("h-4 w-4", !isCollapsed && "mr-3")} />
          {!isCollapsed && <span>{item.name}</span>}
        </Link>
      </TooltipTrigger>
      {isCollapsed && (
        <TooltipContent side="right" className="flex items-center gap-4">
          {item.name}
        </TooltipContent>
      )}
    </Tooltip>
  )

  return (
    <TooltipProvider>
      <>
        <button
          className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-background rounded-md shadow-md"
          onClick={() => setIsMobileOpen(!isMobileOpen)}
          aria-label="Toggle sidebar"
        >
          <Menu className="h-6 w-6" />
        </button>
        <div
          className={cn(
            "fixed inset-y-0 z-20 flex flex-col bg-background transition-all duration-300 ease-in-out lg:static",
            isCollapsed ? "w-[72px]" : "w-72",
            isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          )}
        >
          <div className="border-b border-border">
            <div className={cn("flex h-16 items-center gap-2 px-4", isCollapsed && "justify-center px-2")}>
              {!isCollapsed && (
                <Link href="/" className="flex items-center gap-2 font-semibold">
                  <Spade className="h-5 w-5 text-primary" />
                  <span className="text-lg">Royal Spelsajt</span>
                </Link>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={cn("ml-auto h-8 w-8", isCollapsed && "ml-0")}
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                <ChevronLeft className={cn("h-4 w-4 transition-transform", isCollapsed && "rotate-180")} />
                <span className="sr-only">{isCollapsed ? "Expand" : "Collapse"} Sidebar</span>
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            <nav className="flex-1 space-y-1 px-2 py-4">
              {navigation.map((item) => (
                <NavItem key={item.name} item={item} />
              ))}
            </nav>
          </div>
          <div className="border-t border-border p-2">
            <nav className="space-y-1">
              {bottomNavigation.map((item) => (
                <NavItem key={item.name} item={item} isBottom />
              ))}
            </nav>
          </div>
        </div>
      </>
    </TooltipProvider>
  )
}

