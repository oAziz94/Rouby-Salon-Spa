import { NotificationConfigService } from './notification-config.service';
import { DummyWhatsAppNotificationProvider } from './dummy-whatsapp-notification.provider';
import type { WhatsAppNotificationProvider } from './whatsapp-notification-provider.interface';
import { WapilotWhatsAppNotificationProvider } from './wapilot-whatsapp-notification.provider';

export function createWhatsAppNotificationProvider(deps: {
  config: NotificationConfigService;
  dummy: DummyWhatsAppNotificationProvider;
  wapilot: WapilotWhatsAppNotificationProvider;
}): WhatsAppNotificationProvider {
  if (!deps.config.isEnabled()) {
    return deps.dummy;
  }
  if (deps.config.usesWapilot()) {
    return deps.wapilot;
  }
  return deps.dummy;
}
