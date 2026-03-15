export class ExcelDBError extends Error {
  code: string;
  constructor(message: string, code = 'EXCELDB_ERROR', options?: ErrorOptions) {
    super(message, options);
    this.name = 'ExcelDBError';
    this.code = code;
  }
}

export class ExcelDBAuthError extends ExcelDBError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'AUTH_ERROR', options);
    this.name = 'ExcelDBAuthError';
  }
}

export class ExcelDBConflictError extends ExcelDBError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'CONFLICT', options);
    this.name = 'ExcelDBConflictError';
  }
}

export class ExcelDBSchemaError extends ExcelDBError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'SCHEMA_ERROR', options);
    this.name = 'ExcelDBSchemaError';
  }
}

export class ExcelDBNotFoundError extends ExcelDBError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'NOT_FOUND', options);
    this.name = 'ExcelDBNotFoundError';
  }
}

export class ExcelDBValidationError extends ExcelDBError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'VALIDATION_ERROR', options);
    this.name = 'ExcelDBValidationError';
  }
}
