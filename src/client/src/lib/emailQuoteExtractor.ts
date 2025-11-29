/**
 * Email Quote Extractor
 * Detects and removes quoted/replied text from email HTML
 * Based on Chatwoot's implementation
 */

// Quote detection strategies
const QUOTE_INDICATORS = [
  '.gmail_quote_container',
  '.gmail_quote',
  '.OutlookQuote',
  '.email-quote',
  '.quoted-text',
  '.quote',
  '[class*="quote"]',
  '[class*="Quote"]',
];

const BLOCKQUOTE_FALLBACK_SELECTOR = 'blockquote';

// Regex patterns for quote identification
const QUOTE_PATTERNS = [
  /On .* wrote:/i,
  /-----Original Message-----/i,
  /Sent: /i,
  /From: /i,
];

export class EmailQuoteExtractor {
  /**
   * Remove quotes from email HTML and return cleaned HTML
   */
  static extractQuotes(htmlContent: string): string {
    // Create a temporary DOM element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Remove elements matching class selectors
    QUOTE_INDICATORS.forEach((selector) => {
      tempDiv.querySelectorAll(selector).forEach((el) => {
        el.remove();
      });
    });

    this.removeTrailingBlockquote(tempDiv);

    // Remove text-based quotes
    const textNodeQuotes = this.findTextNodeQuotes(tempDiv);
    textNodeQuotes.forEach((el) => {
      el.remove();
    });

    return tempDiv.innerHTML;
  }

  /**
   * Check if HTML content contains any quotes
   */
  static hasQuotes(htmlContent: string): boolean {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;

    // Check for class-based quotes
    for (const selector of QUOTE_INDICATORS) {
      if (tempDiv.querySelector(selector)) {
        return true;
      }
    }

    if (this.findTrailingBlockquote(tempDiv)) {
      return true;
    }

    // Check for text-based quotes
    const textNodeQuotes = this.findTextNodeQuotes(tempDiv);
    return textNodeQuotes.length > 0;
  }

  /**
   * Find text nodes that match quote patterns
   */
  private static findTextNodeQuotes(rootElement: Element): Element[] {
    const quoteBlocks: Element[] = [];
    const treeWalker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, null);

    let currentNode = treeWalker.nextNode();
    while (currentNode !== null) {
      const textContent = currentNode.textContent || '';
      const isQuoteLike = QUOTE_PATTERNS.some((pattern) =>
        pattern.test(textContent)
      );

      if (isQuoteLike) {
        const parentBlock = this.findParentBlock(currentNode);
        if (parentBlock && !quoteBlocks.includes(parentBlock)) {
          quoteBlocks.push(parentBlock);
        }
      }

      currentNode = treeWalker.nextNode();
    }

    return quoteBlocks;
  }

  /**
   * Find the closest block-level parent element
   */
  private static findParentBlock(node: Node): Element | null {
    const blockElements = ['DIV', 'P', 'BLOCKQUOTE', 'SECTION'];
    let current = node.parentElement;

    while (current) {
      if (blockElements.includes(current.tagName)) {
        return current;
      }
      current = current.parentElement;
    }

    return null;
  }

  /**
   * Remove fallback blockquote if it is the last top-level element
   */
  private static removeTrailingBlockquote(rootElement: Element): void {
    const trailingBlockquote = this.findTrailingBlockquote(rootElement);
    trailingBlockquote?.remove();
  }

  /**
   * Locate a fallback blockquote that is the last top-level element
   */
  private static findTrailingBlockquote(rootElement: Element): Element | null {
    const lastElement = rootElement.lastElementChild;
    if (lastElement?.matches?.(BLOCKQUOTE_FALLBACK_SELECTOR)) {
      return lastElement;
    }
    return null;
  }
}
