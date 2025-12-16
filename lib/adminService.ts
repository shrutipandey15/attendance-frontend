import { functions } from './appwrite';
import { FUNCTION_ID } from './constants';

export const addManualLog = async (employeeId: string, type: 'check-in' | 'check-out', dateObj: Date) => {
    try {
        const payload = JSON.stringify({
            action: 'admin_manage_log',
            operation: 'create',
            data: {
                employeeId,
                type,
                timestamp: dateObj.toISOString()
            }
        });

        const response = await functions.createExecution(FUNCTION_ID, payload);
        const result = JSON.parse(response.responseBody);
        
        if (!result.success) throw new Error(result.message);
        return result;
    } catch (error) {
        console.error("Manual Log Error:", error);
        throw error;
    }
};

export const deleteLog = async (logId: string) => {
    try {
        const payload = JSON.stringify({
            action: 'admin_manage_log',
            operation: 'delete',
            logId: logId
        });

        const response = await functions.createExecution(FUNCTION_ID, payload);
        const result = JSON.parse(response.responseBody);

        if (!result.success) throw new Error(result.message);
        return result;
    } catch (error) {
        console.error("Delete Log Error:", error);
        throw error;
    }
};