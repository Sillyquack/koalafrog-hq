export const beardStudioNow = () => new Date().toISOString()
export const beardStudioId = () => crypto.randomUUID()
export const formatBeardStudioDate = (value: string) => new Date(value).toLocaleDateString()
