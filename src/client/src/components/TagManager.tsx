import { useState } from 'react';
import { X, Plus, Tag as TagIcon } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { useTags, useTicketTags, useAddTagToTicket, useRemoveTagFromTicket, useCreateTag } from '../hooks/useTags';
import type { Tag } from '@/types';

interface TagManagerProps {
  ticketId: number;
  showTags?: boolean;
  showAddButton?: boolean;
  iconOnly?: boolean;
}

export function TagManager({ ticketId, showTags = true, showAddButton = true, iconOnly = false }: TagManagerProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: allTags = [] as Tag[] } = useTags();
  const { data: ticketTags = [] as Tag[] } = useTicketTags(ticketId);
  const addTagMutation = useAddTagToTicket(ticketId);
  const removeTagMutation = useRemoveTagFromTicket(ticketId);
  const createTagMutation = useCreateTag();

  // Filter available tags (not already on ticket)
  const ticketTagIds = new Set(ticketTags.map(t => t.id));
  const availableTags = allTags.filter((tag: Tag) =>
    !ticketTagIds.has(tag.id) &&
    tag.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddExistingTag = async (tag: Tag) => {
    await addTagMutation.mutateAsync(tag.id);
    setSearchTerm('');
    setIsAdding(false);
  };

  const handleCreateAndAddTag = async () => {
    const tagName = searchTerm.trim();
    if (!tagName) return;

    try {
      const newTag = await createTagMutation.mutateAsync({
        name: tagName,
      });
      await addTagMutation.mutateAsync(newTag.id);
      setIsAdding(false);
      setSearchTerm('');
    } catch (error) {
      console.error('Failed to create tag:', error);
    }
  };

  const handleRemoveTag = async (tagId: number) => {
    await removeTagMutation.mutateAsync(tagId);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Existing tags on ticket */}
      {showTags && ticketTags.map(tag => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800"
        >
          {tag.name}
          <button
            onClick={() => handleRemoveTag(tag.id)}
            className="hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-0.5 transition-colors"
            title="Remove tag"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {/* Add tag button */}
      {showAddButton && (
        <>
          <button
            onClick={() => setIsAdding(true)}
            className={iconOnly
              ? "inline-flex items-center justify-center h-10 w-10 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
              : "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            }
            title={iconOnly ? "Add Tag" : undefined}
          >
            {iconOnly ? (
              <TagIcon className="h-4 w-4" />
            ) : (
              <>
                <Plus className="h-3 w-3" />
                Tag
              </>
            )}
          </button>

          {/* Modal for adding tags */}
          <Dialog open={isAdding} onOpenChange={(open) => {
            setIsAdding(open);
            if (!open) setSearchTerm('');
          }}>
            <DialogContent className="w-full sm:max-w-md sm:rounded-lg p-4 sm:p-6">
              <DialogHeader>
                <DialogTitle>Add Tag</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {/* Search/filter existing tags */}
                <input
                  type="text"
                  placeholder="Search or create tag..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
                  autoFocus
                />

                {/* Fixed height content area to prevent resizing */}
                <div className="min-h-[200px]">
                  {/* Available tags list */}
                  {searchTerm && availableTags.length > 0 && (
                    <div className="max-h-[200px] overflow-y-auto space-y-1">
                      {availableTags.map((tag: Tag) => (
                        <button
                          key={tag.id}
                          onClick={() => handleAddExistingTag(tag)}
                          className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors"
                        >
                          {tag.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Create new tag form */}
                  {searchTerm && availableTags.length === 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Create new tag: <strong>"{searchTerm}"</strong>
                      </p>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleCreateAndAddTag}
                          disabled={!searchTerm.trim() || createTagMutation.isPending}
                          className="flex-1"
                        >
                          Create & Add
                        </Button>
                        <Button
                          onClick={() => {
                            setIsAdding(false);
                            setSearchTerm('');
                          }}
                          variant="outline"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Empty state when no search */}
                  {!searchTerm && (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Start typing to search for existing tags or create a new one
                    </p>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
