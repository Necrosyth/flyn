// backend/lib/handlers/error.ts
export interface ApiError {
  error: string;
  details?: any;
  statusCode: number;
}

export function handleError(error: any): ApiError {
  console.error('Error:', error);

  if (error.message === 'Unauthorized') {
    return {
      error: 'Unauthorized',
      statusCode: 401,
    };
  }

  if (error.message === 'Not found') {
    return {
      error: 'Resource not found',
      statusCode: 404,
    };
  }

  if (error.message.includes('Invalid')) {
    return {
      error: error.message,
      statusCode: 400,
    };
  }

  return {
    error: 'Internal server error',
    statusCode: 500,
    details: process.env.NODE_ENV === 'development' ? error.message : undefined,
  };
}
