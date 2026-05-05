// Ported from Suna: components/sidebar/cta.tsx
// Substitutions: next/link -> react-router-dom Link;
// KortixProcessModal -> stub button (no external modal dep needed for Stage 1a)

import {Link} from 'react-router-dom'
import {Briefcase, ExternalLink} from 'lucide-react'

import {Button} from '../ui/button'

export function CTACard() {
  return (
    <div className="rounded-xl bg-gradient-to-br from-blue-50 to-blue-200 dark:from-blue-950/40 dark:to-blue-900/40 shadow-sm border border-blue-200/50 dark:border-blue-800/50 p-4 transition-all">
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">
            Enterprise Demo
          </span>
          <span className="text-xs text-muted-foreground mt-0.5">
            AI employees for your company
          </span>
        </div>

        <div>
          <Button size="sm" className="w-full">
            Book a Demo
          </Button>
        </div>

        <div className="flex items-center pt-1 border-t border-blue-200/50 dark:border-blue-800/30 mt-1">
          <a
            href="https://www.livinity.io/careers"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            <Briefcase className="mr-1.5 h-3.5 w-3.5" />
            Join Our Team!
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  )
}
