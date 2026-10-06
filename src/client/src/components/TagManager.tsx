import { useState } from 'react';
import { Plus, Tag as TagIcon } from 'lucide-react';
import { Input } from './ui/input';
import { FormModal } from '@/components/FormModal';
import { useTags, useTicketTags, useAddTagToTicket, useRemoveTagFromTicket, useCreateTag } from '../hooks/useTags';
import type { Tag } from '@/types';
import { TagBadge } from '@/components/TicketBadges';

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

  const typed = searchTerm.trim().toLowerCase();
  const exactMatch = typed ? availableTags.find((tag: Tag) => tag.name.toLowerCase() === typed) : undefined;
  const alreadyOnTicket = !!typed && ticketTags.some((tag) => tag.name.toLowerCase() === typed);

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
        <TagBadge key={tag.id} name={tag.name} onRemove={() => handleRemoveTag(tag.id)} />
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

          {/* Modal for adding tags: Enter adds the exactly matching tag, or creates it */}
          <FormModal
            open={isAdding}
            onOpenChange={(open) => {
              setIsAdding(open);
              if (!open) setSearchTerm('');
            }}
            title="Add Tag"
            onSubmit={(e) => {
              e.preventDefault();
              if (exactMatch) handleAddExistingTag(exactMatch);
              else handleCreateAndAddTag();
            }}
            isSubmitting={addTagMutation.isPending || createTagMutation.isPending}
            submitDisabled={!searchTerm.trim() || alreadyOnTicket}
            submitLabel={exactMatch || alreadyOnTicket ? 'Add Tag' : 'Create & Add'}
            size="sm"
          >
            {/* Search/filter existing tags */}
            <Input
              type="text"
              placeholder="Search or create tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
                      type="button"
                      onClick={() => handleAddExistingTag(tag)}
                      className="w-full text-left px-3 py-2 text-sm rounded hover:bg-accent transition-colors"
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}

              {/* What submitting will do when nothing matches exactly */}
              {searchTerm.trim() && !exactMatch && (
                <p className="text-sm text-muted-foreground mt-3">
                  {alreadyOnTicket
                    ? <>This ticket already has <strong>"{searchTerm.trim()}"</strong>.</>
                    : <>Create new tag: <strong>"{searchTerm.trim()}"</strong></>}
                </p>
              )}

              {/* Empty state when no search */}
              {!searchTerm && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Start typing to search for existing tags or create a new one
                </p>
              )}
            </div>
          </FormModal>
        </>
      )}
    </div>
  );
}
