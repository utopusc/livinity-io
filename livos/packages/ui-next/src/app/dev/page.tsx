'use client';

import { useState } from 'react';
import {
  Button,
  Input,
  Textarea,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  toast,
  Tooltip,
  Separator,
  Avatar,
  Skeleton,
} from '@/components/ui';
import {
  Settings,
  Zap,
  Trash2,
  Bell,
  User,
  Search,
  ArrowRight,
} from 'lucide-react';

export default function DevPage() {
  const [switchOn, setSwitchOn] = useState(false);
  const [inputVal, setInputVal] = useState('');

  return (
    <div className="min-h-dvh bg-bg p-8 md:p-12">
      <div className="mx-auto max-w-4xl space-y-12">
        {/* Header */}
        <div>
          <h1 className="text-display font-bold tracking-tight">LivOS Design System</h1>
          <p className="text-body-lg text-text-secondary mt-2">
            Next.js 16 + Tailwind CSS 4 + Motion Primitives
          </p>
        </div>

        <Separator />

        {/* Buttons */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Buttons</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="icon"><Settings size={18} /></Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button loading>Loading...</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <Separator />

        {/* Inputs */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Inputs</h2>
          <div className="max-w-sm space-y-3">
            <Input placeholder="Default input..." value={inputVal} onChange={e => setInputVal(e.target.value)} />
            <Input placeholder="Error state" error />
            <Input placeholder="Disabled" disabled />
            <Textarea placeholder="Write something..." />
          </div>
        </section>

        <Separator />

        {/* Cards */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Cards</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>System Status</CardTitle>
                <CardDescription>Your server is running normally</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-body text-text-secondary">All systems operational</span>
                </div>
              </CardContent>
            </Card>
            <Card className="glass">
              <CardHeader>
                <CardTitle>Glass Card</CardTitle>
                <CardDescription>With backdrop blur effect</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-body text-text-secondary">
                  This card uses glassmorphism styling.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <Separator />

        {/* Badges */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Badges</h2>
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="brand">Brand</Badge>
            <Badge variant="success">Success</Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="error">Error</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </section>

        <Separator />

        {/* Switch */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Switch</h2>
          <div className="flex items-center gap-3">
            <Switch checked={switchOn} onCheckedChange={setSwitchOn} />
            <span className="text-body text-text-secondary">
              {switchOn ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </section>

        <Separator />

        {/* Tabs */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Tabs</h2>
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="mt-4">
              <Card>
                <CardContent>
                  <p className="text-text-secondary">General settings content.</p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="security" className="mt-4">
              <Card>
                <CardContent>
                  <p className="text-text-secondary">Security settings content.</p>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="advanced" className="mt-4">
              <Card>
                <CardContent>
                  <p className="text-text-secondary">Advanced settings content.</p>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </section>

        <Separator />

        {/* Dialog */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Dialog</h2>
          <Dialog>
            <DialogTrigger className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-body font-medium text-white hover:bg-brand-light transition-colors cursor-pointer">
              Open Dialog
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm Action</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. Are you sure you want to continue?
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost" size="sm">Cancel</Button>
                <Button size="sm">Continue</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </section>

        <Separator />

        {/* Tooltips & Avatars */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Tooltips & Avatars</h2>
          <div className="flex items-center gap-4">
            <Tooltip content="Settings">
              <Button variant="ghost" size="icon"><Settings size={18} /></Button>
            </Tooltip>
            <Tooltip content="Notifications">
              <Button variant="ghost" size="icon"><Bell size={18} /></Button>
            </Tooltip>
            <Separator orientation="vertical" className="h-6" />
            <Avatar fallback="LO" size="sm" />
            <Avatar fallback="AI" size="md" />
            <Avatar fallback="US" size="lg" />
          </div>
        </section>

        <Separator />

        {/* Toast */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Toast</h2>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => toast('Settings saved successfully')}>
              Show Toast
            </Button>
            <Button variant="secondary" onClick={() => toast.error('Something went wrong')}>
              Error Toast
            </Button>
          </div>
        </section>

        <Separator />

        {/* Skeletons */}
        <section className="space-y-4">
          <h2 className="text-heading font-semibold">Skeletons</h2>
          <div className="space-y-3 max-w-sm">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-10 w-full" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="pt-8 pb-4 text-center text-caption text-text-tertiary">
          LivOS v3.0 Design System Preview
        </div>
      </div>
    </div>
  );
}
