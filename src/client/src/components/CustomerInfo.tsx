/**
 * Customer Information Display
 * Reusable component for showing customer details
 */

import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CustomerInfoProps {
  customerName: string | null;
  customerEmail: string;
  customerTicketCount?: number;
  additionalInfo: string | null;
  isLoadingAdditionalInfo: boolean;
  additionalInfoError: string | null;
}

export function CustomerInfo({
  customerName,
  customerEmail,
  customerTicketCount,
  additionalInfo,
  isLoadingAdditionalInfo,
  additionalInfoError,
}: CustomerInfoProps) {
  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(customerEmail);
      toast.success('Email copied to clipboard');
    } catch (error) {
      console.error('Failed to copy email:', error);
      toast.error('Failed to copy email');
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-lg font-semibold">{customerName || 'Not provided'}</p>
      </div>
      <div>
        <button
          onClick={handleCopyEmail}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-left"
          title="Click to copy email"
        >
          {customerEmail}
        </button>
      </div>
      <div>
        <Link
          to={`/search?query=${encodeURIComponent(customerEmail)}`}
          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
        >
          {customerTicketCount || 0} previous conversation{customerTicketCount !== 1 ? 's' : ''}
        </Link>
      </div>

      {/* Additional Customer Information from Webhook */}
      {isLoadingAdditionalInfo && (
        <div className="pt-3">
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      )}

      {!isLoadingAdditionalInfo && additionalInfoError && (
        <div className="pt-3">
          <p className="text-xs text-red-600">{additionalInfoError}</p>
        </div>
      )}

      {!isLoadingAdditionalInfo && additionalInfo && !additionalInfoError && (
        <div className="pt-3">
          <div
            className="prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: additionalInfo }}
          />
        </div>
      )}
    </div>
  );
}
