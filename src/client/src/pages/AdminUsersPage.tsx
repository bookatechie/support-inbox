/**
 * Admin Users Page
 * Manage support team members (admin only)
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { users as usersApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';
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
import { RichTextEditor } from '@/components/RichTextEditor';
import { Alert } from '@/components/ui/alert';
import { Loader2, UserPlus, Users, Shield, User as UserIcon, Edit, Trash2 } from 'lucide-react';
import type { PasswordValidation } from '@/lib/utils';
import { PasswordInput } from '@/components/PasswordInput';
import { Avatar } from '@/components/Avatar';
import { formatRelativeTime } from '@/lib/formatters';
import { toast } from 'sonner';

export function AdminUsersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Edit state
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingUser, setDeletingUser] = useState<{ id: number; name: string } | null>(null);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [signature, setSignature] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [aiProfile, setAiProfile] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [passwordValidation, setPasswordValidation] = useState<PasswordValidation | null>(null);

  // Check if current user is admin
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

  // Load users
  const loadUsers = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      const data = await usersApi.getAll();
      setUsers(data);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    loadUsers(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password || !name) {
      setError('All fields are required');
      return;
    }

    // Validate password strength
    if (passwordValidation && !passwordValidation.isValid) {
      setError('Password does not meet security requirements');
      return;
    }

    try {
      setIsCreating(true);
      await usersApi.create({ email, password, name, role: 'agent' });

      // Reset form
      setEmail('');
      setPassword('');
      setName('');
      setSignature('');
      setAgentEmail('');
      setAiProfile('');
      setPasswordValidation(null);
      setShowCreateModal(false);

      // Reload users
      await loadUsers();
      toast.success('User created successfully');
    } catch (err: any) {
      setError(err?.data?.error || 'Failed to create user');
      console.error('Failed to create user:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setEmail(user.email);
    setName(user.name);
    setSignature(user.signature || '');
    setAgentEmail(user.agent_email || '');
    setAiProfile(user.ai_profile || '');
    setActive(user.active);
    setPassword(''); // Don't pre-fill password
    setPasswordValidation(null);
    setError('');
    setShowCreateModal(false); // Close create modal if open
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setEmail('');
    setName('');
    setSignature('');
    setAgentEmail('');
    setAiProfile('');
    setActive(true);
    setPassword('');
    setPasswordValidation(null);
    setError('');
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setError('');

    // For admin users, only signature can be updated
    const isAdminUser = editingUser.id === currentUser?.id;

    if (!isAdminUser && (!email || !name)) {
      setError('Email and name are required');
      return;
    }

    // Validate password if being changed
    if (!isAdminUser && password && passwordValidation && !passwordValidation.isValid) {
      setError('Password does not meet security requirements');
      return;
    }

    try {
      setIsUpdating(true);

      // Use existing values for admin user, form values for regular users
      const updateData: any = {
        email: isAdminUser ? editingUser.email : email,
        name: isAdminUser ? editingUser.name : name,
        signature,
        agent_email: agentEmail || null,
        ai_profile: aiProfile || null,
        active,
      };

      if (!isAdminUser && password) {
        updateData.password = password;
      }

      await usersApi.update(editingUser.id, updateData);

      // Reset form
      cancelEdit();

      // Reload users
      await loadUsers();
      toast.success('User updated successfully');
    } catch (err: any) {
      setError(err?.data?.error || 'Failed to update user');
      console.error('Failed to update user:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = (userId: number, userName: string) => {
    setDeletingUser({ id: userId, name: userName });
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;

    try {
      await usersApi.delete(deletingUser.id);
      setShowDeleteModal(false);
      setDeletingUser(null);
      await loadUsers();
      toast.success(`Deleted user: ${deletingUser.name}`);
    } catch (err: any) {
      toast.error('Failed to delete user', {
        description: err?.data?.error || 'Unknown error'
      });
      console.error('Failed to delete user:', err);
    }
  };

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
            <Users className="h-5 w-5 sm:h-6 sm:w-6" />
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">User Management</h1>
              <p className="hidden sm:block text-sm text-muted-foreground">
                Manage support team members
              </p>
            </div>
            <Button onClick={() => setShowCreateModal(true)} size="sm" className="sm:h-10">
              <UserPlus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add User</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {/* Create User Modal */}
          <FormModal
            open={showCreateModal}
            onOpenChange={setShowCreateModal}
            title="Create New User"
            onSubmit={handleSubmit}
            onCancel={() => {
              setShowCreateModal(false);
              setError('');
            }}
            isSubmitting={isCreating}
            submitLabel="Create User"
            error={error}
            size="lg"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                  disabled={isCreating}
                />
              </div>
              <div>
                <Label htmlFor="email">Login Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  required
                  disabled={isCreating}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <PasswordInput
                id="password"
                label="Password"
                value={password}
                onChange={setPassword}
                required
                disabled={isCreating}
                onValidationChange={setPasswordValidation}
              />
              <div>
                <Label htmlFor="agentEmail">Agent Email (optional)</Label>
                <Input
                  id="agentEmail"
                  type="email"
                  value={agentEmail}
                  onChange={(e) => setAgentEmail(e.target.value)}
                  placeholder="john@support.company.com"
                  disabled={isCreating}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="signature">Email Signature (optional)</Label>
              <RichTextEditor
                content={signature}
                onChange={setSignature}
                placeholder="Add your signature (e.g., name, title, contact info)..."
                disabled={isCreating}
              />
            </div>

            <div>
              <Label htmlFor="aiProfile">AI Profile (optional)</Label>
              <textarea
                id="aiProfile"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={aiProfile}
                onChange={(e) => setAiProfile(e.target.value)}
                placeholder="Add context for AI to remember when generating responses (e.g., tone preferences, common instructions)..."
                disabled={isCreating}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be included in AI-generated email responses for personalization
              </p>
            </div>

            <Alert variant="info" className="text-xs">
              <strong>Agent Email Tip:</strong> Personalized email address for sending/receiving emails. Emails sent to this address will auto-assign tickets to this user.
            </Alert>
          </FormModal>

          {/* Edit User Modal */}
          <FormModal
            open={!!editingUser}
            onOpenChange={(open: boolean) => !open && cancelEdit()}
            title={`Edit User: ${editingUser?.name}`}
            onSubmit={handleUpdate}
            onCancel={cancelEdit}
            isSubmitting={isUpdating}
            submitLabel="Update User"
            error={error}
            size="lg"
          >
            {editingUser && editingUser.id === currentUser?.id ? (
              <Alert variant="warning" className="text-sm">
                <strong>Note:</strong> Admin account settings (name, email, password) should be configured in the <code className="bg-background px-1 py-0.5 rounded text-xs">.env</code> file. Only the email signature can be updated here.
              </Alert>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit-name">Full Name</Label>
                    <Input
                      id="edit-name"
                      name="edit-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John Doe"
                      required
                      disabled={isUpdating}
                      autoComplete="off"
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit-email">Login Email</Label>
                    <Input
                      id="edit-email"
                      name="edit-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="john@example.com"
                      required
                      disabled={isUpdating}
                      autoComplete="off"
                      data-lpignore="true"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PasswordInput
                    id="edit-password"
                    label="New Password (optional)"
                    value={password}
                    onChange={setPassword}
                    placeholder="Leave blank to keep current"
                    disabled={isUpdating}
                    onValidationChange={setPasswordValidation}
                    autoComplete="new-password"
                  />
                  <div>
                    <Label htmlFor="edit-agentEmail">Agent Email (optional)</Label>
                    <Input
                      id="edit-agentEmail"
                      type="email"
                      value={agentEmail}
                      onChange={(e) => setAgentEmail(e.target.value)}
                      placeholder="john@support.company.com"
                      disabled={isUpdating}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="edit-active"
                    checked={active}
                    onCheckedChange={(checked) => setActive(!!checked)}
                    disabled={isUpdating}
                  />
                  <Label
                    htmlFor="edit-active"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Active user (inactive users won't appear in ticket assignment dropdown)
                  </Label>
                </div>
              </>
            )}

            <div>
              <Label htmlFor="edit-signature">Email Signature (optional)</Label>
              <RichTextEditor
                content={signature}
                onChange={setSignature}
                placeholder="Add your signature (e.g., name, title, contact info)..."
                disabled={isUpdating}
              />
            </div>

            <div>
              <Label htmlFor="edit-aiProfile">AI Profile (optional)</Label>
              <textarea
                id="edit-aiProfile"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={aiProfile}
                onChange={(e) => setAiProfile(e.target.value)}
                placeholder="Add context for AI to remember when generating responses (e.g., tone preferences, common instructions)..."
                disabled={isUpdating}
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be included in AI-generated email responses for personalization
              </p>
            </div>

            {editingUser && editingUser.id !== currentUser?.id && (
              <Alert variant="info" className="text-xs">
                <strong>Agent Email Tip:</strong> Personalized email address for sending/receiving emails. Emails sent to this address will auto-assign tickets to this user.
              </Alert>
            )}
          </FormModal>

          {/* Users List */}
          <div>
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
              Team Members ({users.length})
            </h2>
            <div className="space-y-2 sm:space-y-3">
              {users.map((user) => (
                <Card key={user.id} className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <div className="hidden sm:block flex-shrink-0">
                      <Avatar name={user.name} email={user.email} size="md" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-medium text-sm sm:text-base">{user.name}</h3>
                        <Badge variant={user.role === 'admin' ? 'default' : 'secondary'} className="text-xs">
                          {user.role === 'admin' ? (
                            <>
                              <Shield className="h-3 w-3 mr-1" />
                              Admin
                            </>
                          ) : (
                            <>
                              <UserIcon className="h-3 w-3 mr-1" />
                              Agent
                            </>
                          )}
                        </Badge>
                        {!user.active && (
                          <Badge variant="destructive" className="text-xs">
                            Inactive
                          </Badge>
                        )}
                        {user.id === currentUser.id && (
                          <Badge variant="outline" className="text-xs">
                            You
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs sm:text-sm text-muted-foreground truncate">
                        {user.email}
                      </div>
                      {user.agent_email && (
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          Agent: {user.agent_email}
                        </div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1 sm:hidden">
                        Created {formatRelativeTime(user.created_at)}
                      </div>
                    </div>
                    <div className="hidden sm:block text-sm text-muted-foreground text-right flex-shrink-0">
                      <div>Created {formatRelativeTime(user.created_at)}</div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(user)}
                        className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                      >
                        <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(user.id, user.name)}
                        disabled={user.id === currentUser.id}
                        className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deletingUser?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingUser(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
