import {
  IsString,
  IsNotEmpty,
  Matches,
  IsBoolean,
  IsIn,
  IsOptional,
  IsObject,
} from 'class-validator';

export class CreateAuthDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(09|\u06F0\u06F9)[0-9\u06F0-\u06F9]{9}$/, {
    message: 'شماره موبایل معتبر نیست',
  })
  phone: string = '';

  @IsString()
  gender: string = '';

  @IsOptional()
  @IsBoolean()
  isCompleted: boolean;

  @IsOptional()
  @IsString()
  acquisitionSource?: string;

  @IsOptional()
  @IsString()
  acquisitionKeyword?: string;

  // @ValidateIf((o: CreateAuthDto) => o.platform === 'web')
  @IsString()
  // @IsNotEmpty({ message: 'توکن reCAPTCHA ضروری است' })
  recaptchaToken?: string = '';

  @IsString()
  @IsIn(['web', 'mobile'], { message: 'پلتفرم نامعتبر است' })
  platform: 'web' | 'mobile';

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
