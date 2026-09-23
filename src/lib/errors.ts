/** Errors whose message is safe to show to the user (Hebrew). */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "אין לך הרשאה לבצע פעולה זו") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "הפריט לא נמצא") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class UnauthenticatedError extends DomainError {
  constructor() {
    super("יש להתחבר מחדש");
    this.name = "UnauthenticatedError";
  }
}
