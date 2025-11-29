/**
 * Canned Responses Management Page
 * Manage pre-written response templates
 */

import { useState, useEffect } from 'react';
import { cannedResponses as cannedResponsesApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import type { CannedResponse } from '@/types';
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
import { FormModal } from '@/components/FormModal';
import { RichTextEditor } from '@/components/RichTextEditor';
import { Loader2, Plus, MessageSquare, Trash2, Edit } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '@/lib/formatters';

export function CannedResponsesPage() {
  const { user: currentUser } = useAuth();
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingResponse, setEditingResponse] = useState<CannedResponse | null>(null);
  const [deletingResponse, setDeletingResponse] = useState<CannedResponse | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  // Load canned responses and update cache
  const loadResponses = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }

      // Always fetch fresh data (this is the management page)
      const data = await cannedResponsesApi.getAll();
      setResponses(data);

      // Update cache for other pages to use
      const cacheKey = 'support-inbox-canned-responses-cache';
      const cacheTimestampKey = 'support-inbox-canned-responses-cache-timestamp';
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      sessionStorage.setItem(cacheTimestampKey, Date.now().toString());
    } catch (error) {
      console.error('Failed to load canned responses:', error);
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      } else {
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    loadResponses(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!title || !content) {
      setError('Title and content are required');
      return;
    }

    try {
      setIsCreating(true);
      await cannedResponsesApi.create({
        title,
        content,
      });

      // Reset form
      setTitle('');
      setContent('');
      setShowCreateModal(false);

      // Reload responses
      await loadResponses();
      toast.success('Canned response created successfully');
    } catch (err: any) {
      setError(err?.data?.error || 'Failed to create canned response');
      console.error('Failed to create canned response:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const startEdit = (response: CannedResponse) => {
    setEditingResponse(response);
    setTitle(response.title);
    setContent(response.content);
    setError('');
    setShowEditModal(true);
  };

  const cancelEdit = () => {
    setEditingResponse(null);
    setTitle('');
    setContent('');
    setError('');
    setShowEditModal(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!editingResponse) return;

    if (!title || !content) {
      setError('Title and content are required');
      return;
    }

    try {
      setIsCreating(true);
      await cannedResponsesApi.update(editingResponse.id, {
        title,
        content,
      });

      // Reset form
      cancelEdit();

      // Reload responses
      await loadResponses();
      toast.success('Canned response updated successfully');
    } catch (err: any) {
      setError(err?.data?.error || 'Failed to update canned response');
      console.error('Failed to update canned response:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = (response: CannedResponse) => {
    setDeletingResponse(response);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!deletingResponse) return;

    try {
      await cannedResponsesApi.delete(deletingResponse.id);
      setShowDeleteModal(false);
      setDeletingResponse(null);
      await loadResponses();
      toast.success('Canned response deleted');
    } catch (err: any) {
      toast.error('Failed to delete canned response', {
        description: err?.data?.error || 'Unknown error'
      });
      console.error('Failed to delete canned response:', err);
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
            <MessageSquare className="h-5 w-5 sm:h-6 sm:w-6" />
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-xl font-bold truncate">Canned Responses</h1>
              <p className="hidden sm:block text-sm text-muted-foreground">
                Quick reply templates for common questions
              </p>
            </div>
            <Button onClick={() => setShowCreateModal(true)} size="sm" className="sm:h-10">
              <Plus className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Add Response</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-2 sm:px-4 py-4 sm:py-6">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
          {/* Responses List */}
          <div>
            <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">
              Saved Responses ({responses.length})
            </h2>
            {responses.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                No canned responses yet. Create one to get started!
              </Card>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {responses.map((response) => (
                  <Card key={response.id} className="p-3 sm:p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="font-semibold text-sm sm:text-base">{response.title}</h3>
                        </div>
                        <div
                          className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3 prose prose-sm max-w-none line-clamp-3 sm:line-clamp-none"
                          dangerouslySetInnerHTML={{ __html: response.content }}
                        />
                        <div className="text-xs text-muted-foreground">
                          Created {formatRelativeTime(response.created_at)}
                        </div>
                      </div>
                      <div className="flex gap-2 sm:ml-4 self-end sm:self-start">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(response)}
                          className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                        >
                          <Edit className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(response)}
                          className="h-8 w-8 sm:h-9 sm:w-9 p-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Modal */}
      <FormModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        title="Create New Response"
        description="Add a new canned response template for quick replies"
        onSubmit={handleSubmit}
        onCancel={() => {
          setShowCreateModal(false);
          setTitle('');
          setContent('');
          setError('');
        }}
        isSubmitting={isCreating}
        submitLabel="Create Response"
        error={error}
        size="xl"
      >
        <div>
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Shipping Information"
            required
            disabled={isCreating}
          />
        </div>

        <div>
          <Label htmlFor="content">Response Content</Label>
          <RichTextEditor
            content={content}
            onChange={setContent}
            placeholder="Enter the response template..."
            disabled={isCreating}
            variables={{
              customer_name: 'Customer Name',
              customer_first_name: 'Customer',
              customer_email: 'customer@example.com',
              ticket_id: '123',
              ticket_subject: 'Ticket Subject',
            }}
            showVariablesBar={true}
          />
        </div>
      </FormModal>

      {/* Edit Modal */}
      <FormModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        title="Edit Response"
        description="Update the canned response template"
        onSubmit={handleUpdate}
        onCancel={cancelEdit}
        isSubmitting={isCreating}
        submitLabel="Update Response"
        error={error}
        size="xl"
      >
        <div>
          <Label htmlFor="edit-title">Title</Label>
          <Input
            id="edit-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Shipping Information"
            required
            disabled={isCreating}
          />
        </div>

        <div>
          <Label htmlFor="edit-content">Response Content</Label>
          <RichTextEditor
            content={content}
            onChange={setContent}
            placeholder="Enter the response template..."
            disabled={isCreating}
            variables={{
              customer_name: 'Customer Name',
              customer_first_name: 'Customer',
              customer_email: 'customer@example.com',
              ticket_id: '123',
              ticket_subject: 'Ticket Subject',
            }}
            showVariablesBar={true}
          />
        </div>
      </FormModal>

      {/* Delete Confirmation Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Canned Response</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingResponse?.title}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteModal(false);
                setDeletingResponse(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
