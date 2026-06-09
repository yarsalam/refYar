export class CreateUserDto {
  phone: string;
  gender: string;
  isCompleted?: boolean;
  metadata?: Record<string, any>;
}
