/**
 * Routing Rules Management Page
 * Admin UI for managing ticket routing rules
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { routingRules as routingRulesApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type {
  RoutingRule,
  RuleCondition,
  RuleConditionGroup,
  RuleActions,
  CreateRoutingRuleRequest,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { BackButton } from '@/components/BackButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FormModal } from '@/components/FormModal';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Route,
  Plus,
  Edit,
  Trash2,
  Shield,
  Play,
  ArrowUpDown,
  Check,
  X,
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

  // Edit state
  const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingRule, setDeletingRule] = useState<RoutingRule | null>(null);

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

  // Form submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Dry-run state
  const [dryRunSubject, setDryRunSubject] = useState('');
  const [dryRunBody, setDryRunBody] = useState('');
  const [dryRunSender, setDryRunSender] = useState('');
  const [dryRunResults, setDryRunResults] = useState<any[]>([]);
  const [isDryRunning, setIsDryRunning] = useState(false);

  // Admin check
  if (currentUser?.role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center">
          <Shield className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground mb-4">
            Only administrators can access this page
          </p>
          <Link to="/tickets">
            <Button>Back to Tickets</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const loadRules = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setIsLoading(true);
      }
      const data = await routingRulesApi.getAll();
      setRules(data.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id));
    } catch (err: any) {
      console.error('Failed to load routing rules:', err);
      toast.error('Failed to load routing rules');
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadRules(true);
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
    setError('');
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
    setError('');
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
    setError('');

    if (!formName.trim()) {
      setError('Rule name is required');
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
    } catch (err: any) {
      setError(err?.data?.error || 'Failed to create rule');
      console.error('Failed to create rule:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;
    setError('');

    if (!formName.trim()) {
      setError('Rule name is required');
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
      setEditingRule(null);
      resetForm();
      loadRules();
    } catch (err: any) {
      setError(err?.data?.error || 'Failed to update rule');
      console.error('Failed to update rule:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRule) return;
    try {
      await routingRulesApi.delete(deletingRule.id);
      toast.success('Routing rule deleted');
      setShowDeleteModal(false);
      setDeletingRule(null);
      loadRules();
    } catch (err: any) {
      toast.error('Failed to delete rule', {
        description: err?.data?.error || 'Unknown error',
      });
    }
  };

  const handleToggleActive = async (rule: RoutingRule) => {
    try {
      await routingRulesApi.update(rule.id, { active: !rule.active });
      toast.success(`Rule ${rule.active ? 'disabled' : 'enabled'}`);
      loadRules();
    } catch (err: any) {
      toast.error(err?.data?.error || 'Failed to toggle rule');
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
    } catch (err: any) {
      toast.error(err?.data?.error || 'Dry-run failed');
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

  const renderRuleForm = () => (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="ruleName">Rule Name</Label>
          <Input
            id="ruleName"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. VIP Customer Orders"
            required
          />
        </div>
        <div>
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
                        <SelectItem key={f} value={f}>{f}</SelectItem>
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
                        <SelectItem key={op} value={op}>{op}</SelectItem>
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
          <div className="text-xs text-muted-foreground text-center">AND between groups</div>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="assignTo">Assign To (User ID)</Label>
            <Input
              id="assignTo"
              value={formAssignTo}
              onChange={(e) => setFormAssignTo(e.target.value)}
              placeholder="e.g. 2"
              type="number"
            />
          </div>
          <div>
            <Label htmlFor="setPriority">Set Priority</Label>
            <Select value={formPriority} onValueChange={setFormPriority}>
              <SelectTrigger id="setPriority">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {PRIORITY_OPTIONS.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="addTags">Add Tags (comma-separated)</Label>
          <Input
            id="addTags"
            value={formTags}
            onChange={(e) => setFormTags(e.target.value)}
            placeholder="e.g. order, vip, urgent"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <Label htmlFor="webhookUrl">Webhook URL</Label>
            <Input
              id="webhookUrl"
              value={formWebhookUrl}
              onChange={(e) => setFormWebhookUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div>
            <Label htmlFor="webhookMethod">Method</Label>
            <Select value={formWebhookMethod} onValueChange={(v: any) => setFormWebhookMethod(v)}>
              <SelectTrigger id="webhookMethod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background">
        <div className="container mx-auto px-2 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-4">
            <BackButton to="/tickets" />
            <Route className="h-5 w-5 sm:h-6 sm:w-6" />
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">Routing Rules</h1>
              <p className="hidden sm:block text-sm text-muted-foreground">
                Manage automatic ticket routing
              </p>
            </div>
            <Button onClick={() => { resetForm(); setShowCreateModal(true); }} size="sm" className="sm:h-10">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Create Rule</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {/* Create Modal */}
          <FormModal
            open={showCreateModal}
            onOpenChange={setShowCreateModal}
            title="Create Routing Rule"
            onSubmit={handleCreate}
            onCancel={() => {
              setShowCreateModal(false);
              setError('');
            }}
            isSubmitting={isSubmitting}
            submitLabel="Create Rule"
            error={error}
            size="xl"
          >
            {renderRuleForm()}
          </FormModal>

          {/* Edit Modal */}
          <FormModal
            open={!!editingRule}
            onOpenChange={(open: boolean) => {
              if (!open) {
                setEditingRule(null);
                resetForm();
              }
            }}
            title={`Edit Rule: ${editingRule?.name} (id:${editingRule?.id})`}
            onSubmit={handleUpdate}
            onCancel={() => {
              setEditingRule(null);
              resetForm();
            }}
            isSubmitting={isSubmitting}
            submitLabel="Save Changes"
            error={error}
            size="xl"
          >
            {renderRuleForm()}
          </FormModal>

          {/* Rules List */}
          <div>
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
              Rules ({rules.length})
            </h2>
            <div className="space-y-2 sm:space-y-3">
              {rules.length === 0 ? (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground">No routing rules configured yet.</p>
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => { resetForm(); setShowCreateModal(true); }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create your first rule
                  </Button>
                </Card>
              ) : (
                rules.map((rule) => (
                  <Card key={rule.id} className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <h3 className="font-medium text-sm sm:text-base">{rule.name}</h3>
                          <button
                            onClick={() => handleToggleActive(rule)}
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                              rule.active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            }`}
                          >
                            {rule.active ? 'Active' : 'Inactive'}
                          </button>
                          {rule.stop_processing ? (
                            <Badge variant="outline" className="text-xs">Stop</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Continue</Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            <ArrowUpDown className="h-3 w-3 mr-1" />
                            {rule.sort_order}
                          </Badge>
                        </div>
                        <div className="text-xs sm:text-sm text-muted-foreground mb-1">
                          <span className="font-medium text-foreground">When:</span>{' '}
                          {summarizeConditions(rule.condition_groups)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Then:</span>{' '}
                          {summarizeActions(rule.actions)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingRule(rule);
                            populateFormFromRule(rule);
                          }}
                          className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                        >
                          <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDeletingRule(rule);
                            setShowDeleteModal(true);
                          }}
                          className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>

          {/* Dry-Run Tester */}
          <Card className="p-4">
            <h3 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
              <Play className="h-4 w-4 sm:h-5 sm:w-5" />
              Dry-Run Tester
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
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
              <Button onClick={handleDryRun} disabled={isDryRunning} size="sm" className="sm:h-10">
                {isDryRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Test Rules
              </Button>
            </div>
            <Input
              placeholder="Message body (optional)"
              value={dryRunBody}
              onChange={(e) => setDryRunBody(e.target.value)}
              className="mb-3"
            />
            {dryRunResults.length > 0 ? (
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
            ) : (
              !isDryRunning && (
                <div className="text-xs text-muted-foreground">No rules matched for this test case.</div>
              )
            )}
          </Card>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Routing Rule</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingRule?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingRule(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default RoutingRulesPage;
