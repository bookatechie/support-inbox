/**
 * Routing Rules Management Page
 * Admin UI for viewing, creating, editing, and testing ticket routing rules
 */

import { useState, useEffect } from 'react';
import { routingRules as routingRulesApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type {
  RoutingRule,
  RuleCondition,
  RuleConditionGroup,
  RuleActions,
  RuleWebhookAction,
  CreateRoutingRuleRequest,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BackButton } from '@/components/BackButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Loader2,
  Plus,
  Trash2,
  Edit,
  Route,
  Check,
  X,
  Play,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { toast } from 'sonner';

const FIELD_OPTIONS = [
  'subject',
  'body',
  'body_html',
  'sender_email',
  'customer_email',
  'customer_domain',
  'to_email',
  'attachment_count',
  'has_attachments',
];

const OPERATOR_OPTIONS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'starts_with',
  'ends_with',
  'regex',
  'in',
  'not_in',
];

const PRIORITY_OPTIONS = ['low', 'normal', 'high', 'urgent'];

function emptyCondition(): RuleCondition {
  return { field: 'subject', operator: 'contains', value: '' };
}

function emptyConditionGroup(): RuleConditionGroup {
  return { combinator: 'and', conditions: [emptyCondition()] };
}

function emptyActions(): RuleActions {
  return {};
}

function summarizeConditions(groups: RuleConditionGroup[]): string {
  if (!groups.length) return 'No conditions';
  const parts = groups.map((g) => {
    const conds = g.conditions
      .map((c) => `${c.field} ${c.operator} "${String(c.value).substring(0, 20)}"`)
      .join(` ${g.combinator} `);
    return `(${conds})`;
  });
  return parts.join(' AND ');
}

function summarizeActions(actions: RuleActions): string {
  const parts: string[] = [];
  if (actions.assign_to) parts.push(`assign→${actions.assign_to}`);
  if (actions.set_priority) parts.push(`priority=${actions.set_priority}`);
  if (actions.add_tags?.length) parts.push(`+tags=${actions.add_tags.join(',')}`);
  if (actions.webhooks?.length) parts.push(`webhooks=${actions.webhooks.length}`);
  return parts.length ? parts.join(', ') : 'No actions';
}

export function RoutingRulesPage() {
  const { user: currentUser } = useAuth();
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
  const [deletingRule, setDeletingRule] = useState<RoutingRule | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dry-run state
  const [dryRunSubject, setDryRunSubject] = useState('');
  const [dryRunBody, setDryRunBody] = useState('');
  const [dryRunSender, setDryRunSender] = useState('');
  const [dryRunResults, setDryRunResults] = useState<any[]>([]);
  const [isDryRunning, setIsDryRunning] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formActive, setFormActive] = useState(true);
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formStopProcessing, setFormStopProcessing] = useState(true);
  const [formConditionGroups, setFormConditionGroups] = useState<RuleConditionGroup[]>([
    emptyConditionGroup(),
  ]);
  const [formActions, setFormActions] = useState<RuleActions>(emptyActions());
  const [formWebhookUrl, setFormWebhookUrl] = useState('');
  const [formWebhookMethod, setFormWebhookMethod] = useState<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>('POST');
  const [formAssignTo, setFormAssignTo] = useState('');
  const [formPriority, setFormPriority] = useState('');
  const [formTags, setFormTags] = useState('');

  const loadRules = async () => {
    try {
      setIsLoading(true);
      const data = await routingRulesApi.getAll();
      setRules(data.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id));
    } catch (error) {
      console.error('Failed to load routing rules:', error);
      toast.error('Failed to load routing rules');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const resetForm = () => {
    setFormName('');
    setFormActive(true);
    setFormSortOrder(0);
    setFormStopProcessing(true);
    setFormConditionGroups([emptyConditionGroup()]);
    setFormActions(emptyActions());
    setFormWebhookUrl('');
    setFormWebhookMethod('POST');
    setFormAssignTo('');
    setFormPriority('');
    setFormTags('');
  };

  const populateFormFromRule = (rule: RoutingRule) => {
    setFormName(rule.name);
    setFormActive(rule.active);
    setFormSortOrder(rule.sort_order);
    setFormStopProcessing(rule.stop_processing);
    setFormConditionGroups(
      rule.condition_groups.length
        ? JSON.parse(JSON.stringify(rule.condition_groups))
        : [emptyConditionGroup()]
    );
    const actions = JSON.parse(JSON.stringify(rule.actions)) as RuleActions;
    setFormActions(actions);
    setFormAssignTo(actions.assign_to ? String(actions.assign_to) : '');
    setFormPriority(actions.set_priority || '');
    setFormTags(actions.add_tags?.join(', ') || '');
    if (actions.webhooks?.length) {
      setFormWebhookUrl(actions.webhooks[0].url);
      setFormWebhookMethod(actions.webhooks[0].method || 'POST');
    } else {
      setFormWebhookUrl('');
      setFormWebhookMethod('POST');
    }
  };

  const buildActionsFromForm = (): RuleActions => {
    const actions: RuleActions = {};
    if (formAssignTo.trim()) actions.assign_to = parseInt(formAssignTo, 10);
    if (formPriority) actions.set_priority = formPriority as any;
    if (formTags.trim()) actions.add_tags = formTags.split(',').map((t) => t.trim()).filter(Boolean);
    if (formWebhookUrl.trim()) {
      actions.webhooks = [
        {
          url: formWebhookUrl.trim(),
          method: formWebhookMethod,
          headers: { 'X-Source': 'box' },
        },
      ];
    }
    return actions;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Rule name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: CreateRoutingRuleRequest = {
        name: formName.trim(),
        active: formActive,
        sort_order: formSortOrder,
        condition_groups: formConditionGroups.map((g) => ({
          ...g,
          conditions: g.conditions.filter((c) => String(c.value).trim() !== ''),
        })),
        actions: buildActionsFromForm(),
        stop_processing: formStopProcessing,
      };
      await routingRulesApi.create(payload);
      toast.success('Routing rule created');
      setShowCreateModal(false);
      resetForm();
      loadRules();
    } catch (error: any) {
      toast.error(error.message || 'Failed to create rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    if (!formName.trim()) {
      toast.error('Rule name is required');
      return;
    }

    try {
      setIsSubmitting(true);
      await routingRulesApi.update(editingRule.id, {
        name: formName.trim(),
        active: formActive,
        sort_order: formSortOrder,
        condition_groups: formConditionGroups.map((g) => ({
          ...g,
          conditions: g.conditions.filter((c) => String(c.value).trim() !== ''),
        })),
        actions: buildActionsFromForm(),
        stop_processing: formStopProcessing,
      });
      toast.success('Routing rule updated');
      setShowEditModal(false);
      setEditingRule(null);
      resetForm();
      loadRules();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRule) return;
    try {
      setIsSubmitting(true);
      await routingRulesApi.delete(deletingRule.id);
      toast.success('Routing rule deleted');
      setShowDeleteModal(false);
      setDeletingRule(null);
      loadRules();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (rule: RoutingRule) => {
    try {
      await routingRulesApi.update(rule.id, { active: !rule.active });
      toast.success(`Rule ${rule.active ? 'disabled' : 'enabled'}`);
      loadRules();
    } catch (error: any) {
      toast.error(error.message || 'Failed to toggle rule');
    }
  };

  const handleDryRun = async () => {
    try {
      setIsDryRunning(true);
      const ticket = {
        id: 99999,
        subject: dryRunSubject || '(no subject)',
        customer_email: dryRunSender || 'test@example.com',
        status: 'open',
        priority: 'normal',
        assignee_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const message = dryRunBody
        ? { sender_email: dryRunSender || 'test@example.com', body: dryRunBody, type: 'email' }
        : undefined;
      const results = await routingRulesApi.dryRun(ticket, message);
      setDryRunResults(results);
    } catch (error: any) {
      toast.error(error.message || 'Dry-run failed');
    } finally {
      setIsDryRunning(false);
    }
  };

  // Condition group helpers
  const updateCondition = (
    groupIdx: number,
    condIdx: number,
    field: keyof RuleCondition,
    value: any
  ) => {
    const groups = [...formConditionGroups];
    groups[groupIdx].conditions[condIdx] = {
      ...groups[groupIdx].conditions[condIdx],
      [field]: value,
    };
    setFormConditionGroups(groups);
  };

  const addCondition = (groupIdx: number) => {
    const groups = [...formConditionGroups];
    groups[groupIdx].conditions.push(emptyCondition());
    setFormConditionGroups(groups);
  };

  const removeCondition = (groupIdx: number, condIdx: number) => {
    const groups = [...formConditionGroups];
    groups[groupIdx].conditions.splice(condIdx, 1);
    if (groups[groupIdx].conditions.length === 0) {
      groups[groupIdx].conditions.push(emptyCondition());
    }
    setFormConditionGroups(groups);
  };

  const addConditionGroup = () => {
    setFormConditionGroups([...formConditionGroups, emptyConditionGroup()]);
  };

  const removeConditionGroup = (idx: number) => {
    const groups = [...formConditionGroups];
    groups.splice(idx, 1);
    if (groups.length === 0) groups.push(emptyConditionGroup());
    setFormConditionGroups(groups);
  };

  const updateGroupCombinator = (idx: number, combinator: 'and' | 'or') => {
    const groups = [...formConditionGroups];
    groups[idx].combinator = combinator;
    setFormConditionGroups(groups);
  };

  const renderRuleForm = (onSubmit: (e: React.FormEvent) => void, submitLabel: string) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ruleName">Rule Name</Label>
          <Input
            id="ruleName"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. VIP Customer Orders"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sortOrder">Sort Order</Label>
          <Input
            id="sortOrder"
            type="number"
            value={formSortOrder}
            onChange={(e) => setFormSortOrder(parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id="formActive"
            checked={formActive}
            onCheckedChange={(c) => setFormActive(!!c)}
          />
          <Label htmlFor="formActive" className="cursor-pointer">
            Active
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="formStop"
            checked={formStopProcessing}
            onCheckedChange={(c) => setFormStopProcessing(!!c)}
          />
          <Label htmlFor="formStop" className="cursor-pointer">
            Stop processing after this rule
          </Label>
        </div>
      </div>

      <Separator />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Conditions</h3>
          <Button type="button" variant="outline" size="sm" onClick={addConditionGroup}>
            <Plus className="h-3 w-3 mr-1" />
            Add Group
          </Button>
        </div>

        {formConditionGroups.map((group, gIdx) => (
          <Card key={gIdx} className="p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground">Group {gIdx + 1}</span>
                <Select
                  value={group.combinator}
                  onValueChange={(v) => updateGroupCombinator(gIdx, v as 'and' | 'or')}
                >
                  <SelectTrigger className="w-24 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="and">AND</SelectItem>
                    <SelectItem value="or">OR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formConditionGroups.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-destructive"
                  onClick={() => removeConditionGroup(gIdx)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>

            {group.conditions.map((cond, cIdx) => (
              <div key={cIdx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3">
                  <Select
                    value={cond.field}
                    onValueChange={(v) => updateCondition(gIdx, cIdx, 'field', v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-3">
                  <Select
                    value={cond.operator}
                    onValueChange={(v) => updateCondition(gIdx, cIdx, 'operator', v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATOR_OPTIONS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-5">
                  <Input
                    className="h-8 text-xs"
                    value={cond.value}
                    onChange={(e) => updateCondition(gIdx, cIdx, 'value', e.target.value)}
                    placeholder="Value"
                  />
                </div>
                <div className="col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive"
                    onClick={() => removeCondition(gIdx, cIdx)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => addCondition(gIdx)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Condition
            </Button>
          </Card>
        ))}

        {formConditionGroups.length > 1 && (
          <div className="text-xs text-muted-foreground text-center">
            AND between groups
          </div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="assignTo">Assign To (User ID)</Label>
            <Input
              id="assignTo"
              value={formAssignTo}
              onChange={(e) => setFormAssignTo(e.target.value)}
              placeholder="e.g. 2"
              type="number"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="setPriority">Set Priority</Label>
            <Select value={formPriority} onValueChange={setFormPriority}>
              <SelectTrigger id="setPriority">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="addTags">Add Tags (comma-separated)</Label>
          <Input
            id="addTags"
            value={formTags}
            onChange={(e) => setFormTags(e.target.value)}
            placeholder="e.g. order, vip, urgent"
          />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              value={formWebhookUrl}
              onChange={(e) => setFormWebhookUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhookMethod">Method</Label>
            <Select value={formWebhookMethod} onValueChange={(v: any) => setFormWebhookMethod(v)}>
              <SelectTrigger id="webhookMethod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Check className="h-4 w-4 mr-2" />
          )}
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <BackButton to="/tickets" />
          <Route className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Routing Rules</h1>
          <div className="flex-1" />
          <Button onClick={() => { resetForm(); setShowCreateModal(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Create Rule
          </Button>
        </div>

        {/* Rules Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium w-16">Active</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium w-20">Order</th>
                  <th className="text-left px-4 py-3 font-medium">Conditions</th>
                  <th className="text-left px-4 py-3 font-medium">Actions</th>
                  <th className="text-left px-4 py-3 font-medium w-24">Stop</th>
                  <th className="text-right px-4 py-3 font-medium w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      No routing rules configured yet.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(rule)}
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                            rule.active
                              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                          }`}
                        >
                          {rule.active ? 'On' : 'Off'}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium">{rule.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rule.sort_order}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground truncate max-w-[200px] inline-block">
                          {summarizeConditions(rule.condition_groups)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-muted-foreground">
                          {summarizeActions(rule.actions)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {rule.stop_processing ? (
                          <Badge variant="outline" className="text-xs">
                            Stop
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-muted-foreground">
                            Continue
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditingRule(rule);
                              populateFormFromRule(rule);
                              setShowEditModal(true);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive"
                            onClick={() => {
                              setDeletingRule(rule);
                              setShowDeleteModal(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Dry-Run Tester */}
        <Card className="mt-6 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Play className="h-4 w-4" />
            Dry-Run Tester
          </h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Input
              placeholder="Subject"
              value={dryRunSubject}
              onChange={(e) => setDryRunSubject(e.target.value)}
            />
            <Input
              placeholder="Sender email"
              value={dryRunSender}
              onChange={(e) => setDryRunSender(e.target.value)}
            />
            <Button onClick={handleDryRun} disabled={isDryRunning}>
              {isDryRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Test
            </Button>
          </div>
          <Input
            placeholder="Message body (optional)"
            value={dryRunBody}
            onChange={(e) => setDryRunBody(e.target.value)}
            className="mb-3"
          />
          {dryRunResults.length > 0 && (
            <div className="space-y-2">
              {dryRunResults.map((r, i) => (
                <Card key={i} className="p-3 text-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={r.matched ? 'default' : 'secondary'}>
                      {r.matched ? 'MATCHED' : 'No match'}
                    </Badge>
                    <span className="font-medium">{r.rule.name}</span>
                  </div>
                  {r.matched && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {r.audit.map((line: string, j: number) => (
                        <div key={j}>{line}</div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          {dryRunResults.length === 0 && !isDryRunning && (
            <div className="text-xs text-muted-foreground">No rules matched</div>
          )}
        </Card>

        {/* Create Modal */}
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Routing Rule</DialogTitle>
              <DialogDescription>
                Define conditions and actions for automatic ticket routing.
              </DialogDescription>
            </DialogHeader>
            {renderRuleForm(handleCreate, 'Create Rule')}
          </DialogContent>
        </Dialog>

        {/* Edit Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Routing Rule</DialogTitle>
              <DialogDescription>Update rule conditions and actions.</DialogDescription>
            </DialogHeader>
            {renderRuleForm(handleUpdate, 'Save Changes')}
          </DialogContent>
        </Dialog>

        {/* Delete Modal */}
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Routing Rule</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deletingRule?.name}"? This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export default RoutingRulesPage;
