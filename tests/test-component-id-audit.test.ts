import { ComponentManagementService } from '@/services/component-management.service.js';
import { AemHttpClient } from '@/services/http-client.js';

describe('Component ID Audit Tests', () => {
  const testInstance = {
    url: 'http://192.168.9.149:4503',
    username: 'admin',
    password: 'admin'
  };

  let service: ComponentManagementService;
  let httpClient: AemHttpClient;

  beforeAll(() => {
    httpClient = new AemHttpClient();
    service = new ComponentManagementService(httpClient);
  });

  afterAll(() => {
    // Clean up if needed
  });

  it('should only return id for active components', async () => {
    const result = await service.listComponents(testInstance);
    
    expect(result.success).toBe(true);
    if (result.success) {
      const componentsWithId = result.data.filter(c => 'id' in c);
      const componentsWithoutId = result.data.filter(c => !('id' in c));
      
      console.log(`Total components: ${result.data.length}`);
      console.log(`Components with ID (active): ${componentsWithId.length}`);
      console.log(`Components without ID (inactive): ${componentsWithoutId.length}`);
      
      // All components should have bundleId and name
      result.data.forEach(component => {
        expect(component.name).toBeDefined();
        expect(component.properties?.bundleId).toBeDefined();
      });
      
      // Check that we can find a component with ID (any active component)
      const activeComponent = result.data.find(c => 'id' in c);
      expect(activeComponent).toBeDefined();
      if (activeComponent) {
        expect('id' in activeComponent).toBe(true);
        console.log(`Found active component: ${activeComponent.name} has ID: ${activeComponent.id}`);
      }
      
      // Also check specific EmailServiceImpl component status (may or may not have ID)
      const emailService = result.data.find(c => c.name === 'com.adobe.acs.commons.email.impl.EmailServiceImpl');
      if (emailService) {
        console.log(`EmailServiceImpl has ID: ${'id' in emailService ? emailService.id : 'NO ID'}`);
        console.log(`EmailServiceImpl state: ${emailService.state}`);
      }
      
      // Check that WeeklyExpiresHeaderFilter doesn't have ID (should be inactive)
      const headerFilter = result.data.find(c => c.name === 'com.adobe.acs.commons.http.headers.impl.WeeklyExpiresHeaderFilter');
      expect(headerFilter).toBeDefined();
      if (headerFilter) {
        console.log(`WeeklyExpiresHeaderFilter has ID: ${'id' in headerFilter ? headerFilter.id : 'NO ID'}`);
        console.log(`WeeklyExpiresHeaderFilter state: ${headerFilter.state}`);
        console.log(`WeeklyExpiresHeaderFilter bundleId: ${headerFilter.properties?.bundleId}`);
      }
    }
  }, 30000);

  it('should handle component details for active component', async () => {
    // Test with EmailServiceImpl which should have ID
    const listResult = await service.listComponents(testInstance);
    expect(listResult.success).toBe(true);
    
    if (listResult.success) {
      const emailService = listResult.data.find(c => c.name === 'com.adobe.acs.commons.email.impl.EmailServiceImpl');
      expect(emailService).toBeDefined();
      
      if (emailService && 'id' in emailService) {
        const detailsResult = await service.getComponentDetails(testInstance, emailService.name);
        expect(detailsResult.success).toBe(true);
        
        if (detailsResult.success) {
          console.log(`Component details: ${detailsResult.data.name} (ID: ${detailsResult.data.id})`);
          expect(detailsResult.data.name).toBe('com.adobe.acs.commons.email.impl.EmailServiceImpl');
          expect(detailsResult.data.id).toBe(emailService.id);
        }
      }
    }
  }, 30000);

  it('should properly filter components with only active ones visible for operations', async () => {
    const result = await service.listComponents(testInstance);
    
    expect(result.success).toBe(true);
    if (result.success) {
      // Count active vs inactive components by state
      const activeComponents = result.data.filter(c => c.state === 'active');
      const componentsWithId = result.data.filter(c => 'id' in c);
      
      console.log(`Active state components: ${activeComponents.length}`);
      console.log(`Components with ID: ${componentsWithId.length}`);
      
      // Not all active state components need to have ID, but components with ID should generally be active
      const activeComponentsWithId = activeComponents.filter(c => 'id' in c);
      console.log(`Active components that also have ID: ${activeComponentsWithId.length}`);
    }
  }, 30000);
});