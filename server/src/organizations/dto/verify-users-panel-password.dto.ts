import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

export class VerifyUsersPanelPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
