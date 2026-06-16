import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackInteraction } from '@/services/crm';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook to automatically track behavioral events across the application.
 * Logs page views and important clicks to the CRM activity stream.
 */
export function useBehavioralTracking() {
  const location = useLocation();
  const { user } = useAuth();
  const lastPath = useRef<string>('');

  useEffect(() => {
    // 1. Track Page Views
    if (location.pathname !== lastPath.current) {
      lastPath.current = location.pathname;
      
      // If we are viewing a specific contact, we can associate the track with them
      // Example: /dashboard/crm/contacts/123
      const contactMatch = location.pathname.match(/\/contacts\/([^/]+)/);
      const contactId = contactMatch ? contactMatch[1] : undefined;

      trackInteraction({
        contactId,
        type: 'page_view',
        target: location.pathname,
        metadata: {
          user: user?.email,
          timestamp: new Date().toISOString(),
        }
      });
    }

    // 2. Track Clicks on Global Elements
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickable = target.closest('button, a, [role="button"]');
      
      if (clickable) {
        const label = clickable.getAttribute('aria-label') || clickable.textContent?.trim().slice(0, 50);
        const contactMatch = window.location.pathname.match(/\/contacts\/([^/]+)/);
        const contactId = contactMatch ? contactMatch[1] : undefined;

        trackInteraction({
          contactId,
          type: 'click',
          target: label || 'unknown_element',
          metadata: {
            path: window.location.pathname,
            user: user?.email,
          }
        });
      }
    };

    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [location, user]);
}
