import * as Contacts from 'expo-contacts';

export interface DeviceContactItem {
  id: string;
  name: string;
  phone: string;
}

export const DeviceContactsService = {
  async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      console.warn('[DeviceContactsService] Permission request notice:', e);
      return false;
    }
  },

  async getDeviceContacts(): Promise<DeviceContactItem[]> {
    const granted = await this.requestPermission();
    if (!granted) {
      throw new Error('Contacts permission denied. Please allow contacts access in phone settings.');
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      sort: Contacts.SortTypes.FirstName,
    });

    const results: DeviceContactItem[] = [];
    if (data && data.length > 0) {
      for (const c of data) {
        if (c.phoneNumbers && c.phoneNumbers.length > 0 && c.phoneNumbers[0].number) {
          const rawNum = c.phoneNumbers[0].number;
          const cleanNum = rawNum.replace(/[^\d+]/g, '');
          results.push({
            id: c.id || Math.random().toString(),
            name: c.name || 'Unnamed Contact',
            phone: cleanNum || rawNum,
          });
        }
      }
    }

    return results;
  }
};
